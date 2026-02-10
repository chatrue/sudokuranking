"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { STR } from "@/lib/i18n";
import { DEFAULT_SETTINGS, loadSettings, type Difficulty } from "@/lib/settings";
import { puzzleToCells, type Cell, anyConflict, getSameNumberIndexes, countNumber } from "@/lib/sudoku";
import { computeScore } from "@/lib/scoring";
import { formatTime } from "@/lib/time";
import { Toast } from "@/components/Toast";

type PublicState = {
  id: string;
  status: "lobby" | "running" | "ended";
  config: {
    difficulty: Difficulty;
    highlightSameNumbers: boolean;
    showCompletedNumbers: boolean;
  };
  members: { id: string; nickname: string; affiliation: string }[];
  startedAt: number | null;
  results: { memberId: string; nickname: string; affiliation: string; score: number; timeMs: number; submittedAt: number }[];
};

function deepCopyCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ value: c.value, given: c.given, memos: [...c.memos] }));
}

export default function GroupRoomPage() {
  const params = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;

  const router = useRouter();

  const isHostQuery = (searchParams?.get("host") ?? "") === "1";


  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const t = STR[settings.lang];

  const [toast, setToast] = useState("");
  const toastRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(""), 2200);
  };

  const [state, setState] = useState<PublicState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nickname, setNickname] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [pin, setPin] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);

  const [hostToken, setHostToken] = useState<string>("");

  const [adminOpen, setAdminOpen] = useState(false);

  const isHostEffective = isHostQuery || !!hostToken;

  const [cells, setCells] = useState<Cell[]>([]);
  const [selected, setSelected] = useState(0);
  const [memoMode, setMemoMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tick, setTick] = useState(0);

  const [undoStack, setUndoStack] = useState<Cell[][]>([]);
  const [redoStack, setRedoStack] = useState<Cell[][]>([]);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setAffiliation(s.country || "");

    if (typeof window !== "undefined") {
      // 이미 참가한 기록이 있으면 복원해서 중복 참가(특히 다시 시작 시)를 막습니다.
      try {
        const mid = localStorage.getItem(`sudoku_member_${roomId}`);
        if (mid) setMemberId(mid);
      } catch {}
      try {
        const ht = localStorage.getItem(`sudoku_host_${roomId}`);
        if (ht) setHostToken(ht);
      } catch {}
      try {
        const sp = localStorage.getItem(`sudoku_pin_${roomId}`);
        if (sp) setPin(sp);
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchState() {
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setStateError(json?.error ? String(json.error) : "not_found");
        return;
      }

      setState(json.state);
      setStateError(null);
    } catch {
      setStateError("network");
    }
  }

  function openAdmin() {
    setAdminOpen(true);
  }

  async function resetMatchAsHost() {
    if (!isHostEffective) return;
    try {
      await fetch(`/api/rooms/${roomId}/reset`, { method: "POST" });
      await fetchState();
      showToast(settings.lang === "ko" ? "다시 시작했어요." : "Restarted.");
    } catch {
      showToast(settings.lang === "ko" ? "다시 시작 실패" : "Restart failed");
    }
  }

  async function endRoomAsHost() {
    if (!isHostEffective) return;
    const ok = window.confirm(settings.lang === "ko" ? "정말로 방을 끝낼까요? (모두 종료됩니다)" : "End this room for everyone?");
    if (!ok) return;
    try {
      const tok = localStorage.getItem(`sudoku_host_${roomId}`) || hostToken || "";
      await fetch(`/api/rooms/${roomId}/end`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken: tok }),
      });
      try {
        localStorage.removeItem(`sudoku_host_${roomId}`);
        localStorage.removeItem(`sudoku_pin_${roomId}`);
        localStorage.removeItem(`sudoku_member_${roomId}`);
      } catch {}
      router.push("/");
    } catch {
      showToast(settings.lang === "ko" ? "끝내기 실패" : "End failed");
    }
  }


  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await fetchState();
      if (alive) setLoading(false);
    })();

    pollRef.current = window.setInterval(fetchState, 1200);
    return () => {
      alive = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function loadPuzzle() {
    const res = await fetch(`/api/rooms/${roomId}/puzzle`, { cache: "no-store" });
    const json = await res.json();
    if (!json?.ok) throw new Error("puzzle_failed");
    const p = json.puzzle;
    const init = puzzleToCells(p);
    setCells(init);
    setSelected(0);
    setMemoMode(false);
  }

  
  // 방장(host=1)으로 들어온 경우: 저장된 PIN이 있으면 자동 참가 처리
  useEffect(() => {
    if (!isHostEffective) return;
    if (!state) return;
    if (state.status !== "lobby") return;
    if (memberId) return;

    // 로컬에 이미 memberId가 저장되어 있다면 우선 복원
    if (typeof window !== "undefined") {
      try {
        const mid = localStorage.getItem(`sudoku_member_${roomId}`);
        if (mid) {
          setMemberId(mid);
          return;
        }
      } catch {}
    }

    // 혹시 방에 이미 "방장/Host"가 남아 있다면(리셋 시 멤버를 유지) 중복 참가를 막습니다.
    const hostNick = settings.lang === "ko" ? "방장" : "Host";
    if ((state.members || []).some((m: any) => (m.nickname || "") === hostNick)) return;
    const autoJoinHost = async () => {
      const nick = nickname || (settings.lang === "ko" ? "방장" : "Host");
      const p = pin || "";
      if (!p) return; // PIN이 없으면 수동 입력
      try {
        await join(nick, affiliation, p);
      } catch {}
    };
    autoJoinHost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHostEffective, state?.status, pin]);


  // 리셋(로비로 전환)될 때: 각 클라이언트가 들고 있는 퍼즐/진행 상태를 비워서
  // 다음 running에서 "같은 퍼즐"을 서버에서 다시 로드하도록 합니다.
  useEffect(() => {
    if (!state) return;
    if (state.status === "lobby") {
      setCells([]);
      setUndoStack([]);
      setRedoStack([]);
      setSubmitted(false);
      setSelected(0);
      setMemoMode(false);
      setTick(0);
    }
    if (state.status === "ended") {
      setCells([]);
      setUndoStack([]);
      setRedoStack([]);
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status]);

useEffect(() => {
    if (!state) return;
    if (state.status === "running" && cells.length === 0) {
      loadPuzzle().catch(() => showToast(t.loadPuzzleFail));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status]);

  useEffect(() => {
    if (state?.status !== "running") return;
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [state?.status]);

  const elapsedSec = !state?.startedAt
    ? 0
    : Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));

  const isSolved = useMemo(() => {
    if (cells.length !== 81) return false;
    const allFilled = cells.every((c) => c.value !== 0);
    if (!allFilled) return false;
    return !anyConflict(cells);
  }, [cells]);

  const selectedValue = cells[selected]?.value ?? 0;

  const sameIndexes = useMemo(() => {
    if (!state?.config.highlightSameNumbers) return [];
    return getSameNumberIndexes(cells, selectedValue);
  }, [cells, selectedValue, state?.config.highlightSameNumbers]);

  const numberDone = useMemo(() => {
    if (!state?.config.showCompletedNumbers) return Array.from({ length: 10 }, () => false);
    const done = Array.from({ length: 10 }, () => false);
    for (let n = 1; n <= 9; n++) done[n] = countNumber(cells, n) >= 9;
    return done;
  }, [cells, state?.config.showCompletedNumbers]);

  const scoreInfo = useMemo(() => {
    const cfg = state?.config;
    return computeScore({
      difficulty: cfg?.difficulty ?? "easy",
      elapsedSec,
      highlightSameNumbers: cfg?.highlightSameNumbers ?? false,
      showCompletedNumbers: cfg?.showCompletedNumbers ?? false,
    });
  }, [state?.config, elapsedSec]);

  function applyNumber(n: number) {
    const cur = cells[selected];
    if (!cur || cur.given) return;
    setUndoStack((st) => [...st, deepCopyCells(cells)]);
    setRedoStack([]);
    const next = deepCopyCells(cells);

    if (memoMode) next[selected].memos[n - 1] = !next[selected].memos[n - 1];
    else {
      next[selected].value = n;
      next[selected].memos = Array.from({ length: 9 }, () => false);
    }
    setCells(next);
  }

  function clearAll() {
    setUndoStack((st) => [...st, deepCopyCells(cells)]);
    setRedoStack([]);
    const next = deepCopyCells(cells);
    for (let i = 0; i < next.length; i++) {
      if (next[i].given) continue;
      next[i].value = 0;
      next[i].memos = Array.from({ length: 9 }, () => false);
    }
    setCells(next);
  }

  function erase() {
    const cur = cells[selected];
    if (!cur || cur.given) return;
    setUndoStack((st) => [...st, deepCopyCells(cells)]);
    setRedoStack([]);
    const next = deepCopyCells(cells);
    next[selected].value = 0;
    next[selected].memos = Array.from({ length: 9 }, () => false);
    setCells(next);
  }

  function undo() {
    setUndoStack((st) => {
      if (st.length === 0) return st;
      const prev = st[st.length - 1];
      setRedoStack((rt) => [...rt, deepCopyCells(cells)]);
      setCells(prev);
      return st.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((rt) => {
      if (rt.length === 0) return rt;
      const next = rt[rt.length - 1];
      setUndoStack((st) => [...st, deepCopyCells(cells)]);
      setCells(next);
      return rt.slice(0, -1);
    });
  }

  
  async function join(nickArg?: any, affArg?: any, pinArg?: any) {
  const nick = String(typeof nickArg === "string" ? nickArg : (nickname ?? "")).trim();
  const p = String(typeof pinArg === "string" ? pinArg : (pin ?? "")).trim();
  const aff = String(typeof affArg === "string" ? affArg : (affiliation ?? "")).trim();

  if (!nick) return showToast(t.enterNickname);
  if (!p) return showToast(t.enterPin);

  try {
    const res = await fetch(`/api/rooms/${roomId}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: nick, affiliation: aff, pin: p }),
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || !json?.ok) {
      throw new Error(String(json?.error || `http_${res.status}`));
    }

    setMemberId(String(json.memberId));
    try { localStorage.setItem(`sudoku_member_${roomId}`, String(json.memberId)); } catch {}
    showToast(settings.lang === "ko" ? "참가 완료!" : "Joined!");
    await fetchState();
  } catch (e: any) {
    const msg = String(e?.message ?? "join_failed");
    // ✅ 이제 원인이 보임 (bad_pin / not_in_lobby / nickname_taken 등)
    showToast(settings.lang === "ko" ? `참가 실패: ${msg}` : `Join failed: ${msg}`);
  }
}


  async function endAsHost() {
    if (!isHostEffective) return;
    try {
      const tok = localStorage.getItem(`sudoku_host_${roomId}`) || "";
      await fetch(`/api/rooms/${roomId}/end`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken: tok }),
      });
      await fetchState();
    } catch (e: any) {
      showToast(t.endFail);
    }
  }

  async function submit() {
    if (!memberId) return;
    if (!isSolved) return showToast(t.notSolved);

    try {
      const res = await fetch(`/api/rooms/${roomId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId,
          score: scoreInfo.total,
          timeMs: elapsedSec * 1000,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "submit_failed");
      setSubmitted(true);
      showToast(t.submitDone);
      await fetchState();
    } catch (e: any) {
      showToast(t.submitFail.replace("{msg}", String(e?.message ?? "unknown")));
    }
  }

  async function hostStart() {
    if (!isHostEffective || !hostToken) return;
    try {
      await fetch(`/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken }),
      });
      await fetchState();
    } catch {
      showToast(settings.lang === "ko" ? "시작 실패" : "Start failed");
    }
  }

  async function hostReset() {
    if (!isHostEffective) return;
    try {
      await fetch(`/api/rooms/${roomId}/reset`, { method: "POST" });
      setCells([]); // 다음 경기 퍼즐 재로딩 유도
      setSubmitted(false);
      await fetchState();
      showToast(settings.lang === "ko" ? "다시 시작!" : "Restarted!");
    } catch {
      showToast(settings.lang === "ko" ? "다시 시작 실패" : "Restart failed");
    }
  }

  async function hostEndGame() {
    if (!isHostEffective || !hostToken) return;
    try {
      await fetch(`/api/rooms/${roomId}/end`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken }),
      });
      await fetchState();
    } catch {
      showToast(settings.lang === "ko" ? "종료 실패" : "End failed");
    }
  }

  const ranked = useMemo(() => {
    const rows = (state?.results ?? []).slice();
    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
      return a.submittedAt - b.submittedAt;
    });
    return rows;
  }, [state?.results]);

  const [closeTried, setCloseTried] = useState(false);
  function closeWindow() {
    setCloseTried(true);
    try {
      // PWA/모바일에서는 window.close()가 무시될 수 있어 홈으로 이동합니다.
      window.location.href = "/";
    } catch {}
  }

  if (loading || !state) {
    return (
      <div className="container" style={{ padding: "14px 12px 20px" }}>
        <div className="card" style={{ overflow: "auto", maxWidth: 360, margin: "0 auto", padding: "18px 18px" }}>
          <div className="brand">SuDoKu ranking</div>

          {stateError ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 850 }}>{t.invalidInvite}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                {t.roomExpiredHint}
              </div>
              <button className="submitBtn" style={{ marginTop: 14 }} onClick={closeWindow}>
                {t.close}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>{t.loadingEllipsis}</div>
          )}

          <Toast message={toast} />
        </div>
      </div>
    );
  }

  if (state.status === "ended") {
    return (
      <div className="container" style={{ padding: "14px 12px 20px" }}>
        <div className="card" style={{ overflow: "auto" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
          </div>

          <div style={{ marginTop: 18, fontSize: 15, lineHeight: 1.5, textAlign: "center" }}>
            {t.groupEnded}
          </div>

          {/* 제출자 랭킹 */}
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
            {settings.lang === "ko" ? "제출한 사람 랭킹" : "Submission ranking"}
          </div>
          <div className="lobbyList" style={{ maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
            {ranked.length ? (
              ranked.map((r, idx) => (
                <div className="lobbyRow" key={`${r.memberId}-${idx}`}>
                  <div className="lobbyName">
                    {idx + 1}. {r.nickname || (settings.lang === "ko" ? "참가자" : "Player")}
                  </div>
                  <div className="lobbyMeta">
                    {r.score} · {formatTime(Math.floor((r.timeMs || 0) / 1000))}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "10px 6px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                {settings.lang === "ko" ? "아직 제출한 사람이 없습니다." : "No submissions yet."}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <button className="submitBtn" style={{ marginTop: 16, maxWidth: 320 }} onClick={closeWindow}>
              {t.close}
            </button>
          </div>

          <Toast message={toast} />
        </div>
      </div>
    );
  }
if (state.status === "lobby" && !memberId) {
    return (
      <div className="container" style={{ padding: "14px 12px" }}>
        <div className="card" style={{ overflow: "auto", maxWidth: 360, margin: "0 auto", padding: "18px 18px" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
            <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={settings.lang === "ko" ? "예: 민수" : "e.g., Alex"} />
            <input className="input" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" inputMode="numeric" />
            <button className="submitBtn" onClick={() => join()}>{settings.lang === "ko" ? "참가하기" : "Join"}</button>
          </div>

          <Toast message={toast} />
        </div>
      </div>
    );
  }
if (state.status === "lobby" && memberId) {
    const list = (state.members || []).slice().sort((a: any, b: any) => (a.joinedAt || 0) - (b.joinedAt || 0));
    return (
      <div className="container" style={{ padding: "12px 10px" }}>
        <div className="card" style={{ overflow: "auto" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{t.participants}</div>

          <div className="lobbyList" aria-label={t.participants}>
            {list.length ? (
              list.map((m: any, idx: number) => (
                <div className="lobbyRow" key={m.id || idx}>
                  <div className="lobbyName">
                    {idx + 1}. {m.nickname || (settings.lang === "ko" ? "참가자" : "Player")}
                  </div>
                  <div className="lobbyMeta">{m.isHostEffective ? t.host : ""}</div>
                </div>
              ))
            ) : (
              <div style={{ padding: "10px 6px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                {settings.lang === "ko" ? "아직 참가자가 없습니다." : "No participants yet."}
              </div>
            )}
          </div>

          {isHostEffective ? (
            <div style={{ display: "flex", gap: 10, padding: "0 14px", marginTop: 14 }}>
              <button className="submitBtn" style={{ flex: 1, marginTop: 0 }} onClick={hostStart}>
                {settings.lang === "ko" ? "경기 시작" : "Start"}
              </button>
            </div>
          ) : null}
          <div className="blinkSoft" style={{ marginTop: 14, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            {t.waiting}
          </div>
        </div>
      </div>
    );
  }
// running
  return (
    <div className="container">
      <div className="card" style={{ overflow: "auto", maxWidth: 360, margin: "0 auto" }}>
        <div className="headerRow">
          <div className="brand">SuDoKu ranking</div>
          <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
            {formatTime(elapsedSec)}
          </div>
        </div>

        <div className="boardWrap">
          <div className="board">
            {cells.map((c, i) => {
              const r = Math.floor(i / 9);
              const cc = i % 9;
              const thickR = cc === 2 || cc === 5;
              const thickB = r === 2 || r === 5;
              const isSel = i === selected;
              const isSame = sameIndexes.includes(i);

              const cls = ["cell", thickR ? "thickR" : "", thickB ? "thickB" : "", isSel ? "selected" : "", isSame ? "same" : ""]
                .filter(Boolean)
                .join(" ");

              return (
                <div key={i} className={cls} onClick={() => setSelected(i)} role="button" aria-label={`cell-${i}`}>
                  {c.value !== 0 ? (
                    <div className={c.given ? "given" : "entered"}>{c.value}</div>
                  ) : c.memos.some(Boolean) ? (
                    <div className="memos">
                      {Array.from({ length: 9 }, (_, k) => (
                        <div key={k} className="memoDot">{c.memos[k] ? k + 1 : ""}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="padWrap">
          <div className="numPad">
            {Array.from({ length: 9 }, (_, i) => {
              const n = i + 1;
              const done = numberDone[n];
              return (
                <button key={n} className={"numBtn " + (done ? "done " : "")} onClick={() => applyNumber(n)}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ctrlWrap">
          <div className="ctrlRow">
            <button className="textAction" onClick={undo} disabled={undoStack.length === 0}>{t.undo}</button>
            <button className="textAction" onClick={redo} disabled={redoStack.length === 0}>{t.redo}</button>
            <button className="textAction" onClick={() => setMemoMode(!memoMode)}>
                {memoMode ? <span className="blinkText">{t.memo} {t.memoOn}</span> : <span>{t.memo} {t.memoOff}</span>}
              </button>
            <button className="textAction" onClick={erase}>{t.erase}</button>
            <button className="textAction" onClick={clearAll}>{t.clearAll}</button>
          </div>
        </div>

        <div className="submitWrap">
          {memoMode ? (
            <div style={{ marginBottom: 10, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
              {t.numberHint}
            </div>
          ) : null}

          <button className="submitBtn" onClick={submit} disabled={!isSolved || submitted}>
            {submitted ? t.submitDone : t.submit}
          </button>
<div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{t.currentRanking}</div>
            {ranked.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>{t.noSubmissions}</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {ranked.map((r, i) => (
                  <div key={r.memberId} className="infoItem" style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <div style={{ width: 18, fontWeight: 900 }}>{i + 1}</div>
                      <div style={{ fontWeight: 850 }}>{r.nickname}</div>
                    </div>
                    <div style={{ fontWeight: 900 }}>{t.points.replace("{p}", String(r.score))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        
        {isHostEffective ? (
          <>
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 10, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 40 }}>
              <button
                className="submitBtn"
                style={{ width: "calc(100% - 28px)", maxWidth: 520, padding: "12px 14px", pointerEvents: "auto" }}
                onClick={openAdmin}
              >
                {settings.lang === "ko" ? "관리" : "Admin"}
              </button>
            </div>

            {adminOpen ? (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.35)",
                  zIndex: 60,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "flex-end",
                  padding: 12,
                }}
                onClick={() => setAdminOpen(false)}
              >
                <div
                  className="card"
                  style={{ width: "min(560px, 100%)", padding: 14, borderRadius: 18 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{settings.lang === "ko" ? "방장 관리" : "Host controls"}</div>
                    <button className="textAction" onClick={() => setAdminOpen(false)}>{settings.lang === "ko" ? "닫기" : "Close"}</button>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <button className="submitBtn" onClick={resetMatchAsHost}>
                      {settings.lang === "ko" ? "다시 시작" : "Restart"}
                    </button>

                    <button className="submitBtn" style={{ background: "rgba(245,246,248,0.8)", color: "var(--text)", border: "1px solid var(--border)" }} onClick={endRoomAsHost}>
                      {settings.lang === "ko" ? "끝내기" : "End"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

<Toast message={toast} />
      </div>
    </div>
  );
}
