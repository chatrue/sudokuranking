"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
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

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PublicState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);

  const [toast, setToast] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  };

  const [pin, setPin] = useState("");
  const [hostToken, setHostToken] = useState("");
  const [memberId, setMemberId] = useState("");
  const [nickname, setNickname] = useState("");
  const [affiliation, setAffiliation] = useState("");

  const [adminOpen, setAdminOpen] = useState(false);

  const [cells, setCells] = useState<Cell[]>([]);
  const [selected, setSelected] = useState(0);
  const [memoMode, setMemoMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tick, setTick] = useState(0);

  // ✅ startedAt이 서버에서 늦게/안 올 때 대비: 로컬 startedAt
  const [localStartedAt, setLocalStartedAt] = useState<number | null>(null);

  const [undoStack, setUndoStack] = useState<Cell[][]>([]);
  const [redoStack, setRedoStack] = useState<Cell[][]>([]);

  const pollRef = useRef<number | null>(null);

  const isHostEffective = useMemo(() => {
    if (!isHostQuery) return false;
    return true;
  }, [isHostQuery]);

  useEffect(() => {
    setSettings(loadSettings());
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

    if (typeof window !== "undefined") {
      try {
        const savedMember = localStorage.getItem(`sudoku_member_${roomId}`);
        const savedPin = localStorage.getItem(`sudoku_pin_${roomId}`);
        const savedHostToken = localStorage.getItem(`sudoku_host_${roomId}`);

        if (savedHostToken) setHostToken(savedHostToken);
        if (savedPin) setPin(savedPin);
        if (savedMember) setMemberId(savedMember);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHostEffective, state?.status, roomId]);

  // 상태 변화 시 로컬 UI 리셋/퍼즐 로드
  useEffect(() => {
    if (!state) return;

    if (state.status === "lobby") {
      setCells([]);
      setSelected(0);
      setMemoMode(false);
      setUndoStack([]);
      setRedoStack([]);
      setSubmitted(false);
      setTick(0);
      setLocalStartedAt(null);
    }

    if (state.status === "running") {
      if (cells.length !== 81) {
        loadPuzzle().catch(() =>
          showToast(settings.lang === "ko" ? "퍼즐 불러오기 실패" : "Failed to load puzzle")
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status]);

  // ✅ running으로 전환됐는데 startedAt이 아직 없으면 로컬로 즉시 시작
  useEffect(() => {
    if (state?.status !== "running") return;
    if (state?.startedAt) return;
    setLocalStartedAt((prev) => prev ?? Date.now());
  }, [state?.status, state?.startedAt]);

  // ✅ running이면 무조건 1초 tick 돌림 (startedAt 유무 상관없이 화면 갱신 보장)
  useEffect(() => {
    if (state?.status !== "running") return;
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [state?.status]);

  const startedAtMs = useMemo(() => {
    const v: any = state?.startedAt ?? localStartedAt;
    if (!v) return null;

    if (typeof v === "number" && Number.isFinite(v)) return v;

    const tt = new Date(v).getTime();
    return Number.isFinite(tt) ? tt : null;
  }, [state?.startedAt, localStartedAt]);

  const elapsedSec = useMemo(() => {
    const _ = tick; // tick 변화로 1초마다 재계산
    if (!startedAtMs) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  }, [startedAtMs, tick]);

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

    if (!memoMode) {
      next[selected].value = n;
      next[selected].memos = Array(9).fill(false);
    } else {
      next[selected].memos[n - 1] = !next[selected].memos[n - 1];
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
    next[selected].memos = Array(9).fill(false);
    setCells(next);
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((st) => st.slice(0, -1));
    setRedoStack((st) => [...st, deepCopyCells(cells)]);
    setCells(prev);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((st) => st.slice(0, -1));
    setUndoStack((st) => [...st, deepCopyCells(cells)]);
    setCells(next);
  }

  async function joinAsMember() {
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, nickname, affiliation }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        showToast(settings.lang === "ko" ? "참가 실패" : "Join failed");
        return;
      }
      setMemberId(json.memberId);
      try {
        localStorage.setItem(`sudoku_member_${roomId}`, String(json.memberId));
        localStorage.setItem(`sudoku_pin_${roomId}`, String(pin));
      } catch {}
      await fetchState();
      showToast(settings.lang === "ko" ? "참가했어요." : "Joined.");
    } catch {
      showToast(settings.lang === "ko" ? "네트워크 오류" : "Network error");
    }
  }

  async function hostStart() {
    if (!isHostEffective) return;
    try {
      const tok = localStorage.getItem(`sudoku_host_${roomId}`) || hostToken || "";

      const res = await fetch(`/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken: tok }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        showToast(settings.lang === "ko" ? "시작 실패" : "Start failed");
        return;
      }

      // ✅ 서버 startedAt이 늦게 반영돼도 UI 타이머가 즉시 움직이게 로컬 시작
      setLocalStartedAt(Date.now());
      setTick(0);

      await fetchState();
    } catch {
      showToast(settings.lang === "ko" ? "시작 실패" : "Start failed");
    }
  }

  async function submitResult() {
    if (!memberId) return;
    if (!startedAtMs) return;

    try {
      const res = await fetch(`/api/rooms/${roomId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId,
          score: scoreInfo.total,
          timeMs: Date.now() - startedAtMs,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        showToast(settings.lang === "ko" ? "제출 실패" : "Submit failed");
        return;
      }

      setSubmitted(true);
      await fetchState();
      showToast(settings.lang === "ko" ? "제출 완료!" : "Submitted!");
    } catch {
      showToast(settings.lang === "ko" ? "네트워크 오류" : "Network error");
    }
  }

  // 로딩/에러 화면
  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 360, margin: "0 auto" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
          </div>
          <div style={{ padding: 16, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            {settings.lang === "ko" ? "불러오는 중..." : "Loading..."}
          </div>
        </div>
        <Toast message={toast} />
      </div>
    );
  }

  if (stateError) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 360, margin: "0 auto" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
          </div>
          <div style={{ padding: 16, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            {settings.lang === "ko" ? `방을 찾을 수 없어요. (${stateError})` : `Room not found. (${stateError})`}
          </div>
          <div style={{ display: "flex", gap: 10, padding: "0 14px 16px" }}>
            <button className="submitBtn" style={{ flex: 1, marginTop: 0 }} onClick={() => router.push("/")}>
              {settings.lang === "ko" ? "홈으로" : "Home"}
            </button>
          </div>
        </div>
        <Toast message={toast} />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 360, margin: "0 auto" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
          </div>
          <div style={{ padding: 16, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            {settings.lang === "ko" ? "방 상태를 불러오지 못했어요." : "Failed to load room state."}
          </div>
          <div style={{ display: "flex", gap: 10, padding: "0 14px 16px" }}>
            <button className="submitBtn" style={{ flex: 1, marginTop: 0 }} onClick={() => fetchState()}>
              {settings.lang === "ko" ? "다시 시도" : "Retry"}
            </button>
          </div>
        </div>
        <Toast message={toast} />
      </div>
    );
  }

  // ended -> 결과 화면
  if (state.status === "ended") {
    const resultsSorted = [...(state.results ?? [])].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeMs - b.timeMs;
    });

    return (
      <div className="container">
        <div className="card" style={{ overflow: "auto", maxWidth: 360, margin: "0 auto" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
            <button className="iconBtn" onClick={() => router.push("/")}>
              {settings.lang === "ko" ? "홈" : "Home"}
            </button>
          </div>

          <div style={{ padding: "14px 14px 8px", fontWeight: 700, fontSize: 14 }}>
            {settings.lang === "ko" ? "결과" : "Results"}
          </div>

          <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {resultsSorted.length ? (
              resultsSorted.map((r, idx) => (
                <div key={r.memberId} className="rowCard">
                  <div style={{ fontWeight: 700 }}>
                    {idx + 1}. {r.nickname || (settings.lang === "ko" ? "참가자" : "Player")}
                  </div>
                  <div className="rowMeta">{r.affiliation || "-"}</div>
                  <div className="rowMeta">
                    {(settings.lang === "ko" ? "점수" : "Score")}: {r.score} ·{" "}
                    {(settings.lang === "ko" ? "시간" : "Time")}: {formatTime(Math.floor((r.timeMs ?? 0) / 1000))}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "10px 6px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                {settings.lang === "ko" ? "아직 결과가 없습니다." : "No results yet."}
              </div>
            )}
          </div>

          {isHostEffective ? (
            <div style={{ display: "flex", gap: 10, padding: "0 14px 16px" }}>
              <button className="submitBtn" style={{ flex: 1, marginTop: 0 }} onClick={resetMatchAsHost}>
                {settings.lang === "ko" ? "다시 시작" : "Restart"}
              </button>
            </div>
          ) : null}
        </div>
        <Toast message={toast} />
      </div>
    );
  }

  // lobby -> 참가 화면
  if (state.status === "lobby") {
    const members = state.members ?? [];

    return (
      <div className="container">
        <div className="card" style={{ overflow: "auto", maxWidth: 360, margin: "0 auto" }}>
          <div className="headerRow">
            <div className="brand">SuDoKu ranking</div>
            <button className="iconBtn" onClick={() => router.push("/")}>
              {settings.lang === "ko" ? "홈" : "Home"}
            </button>
          </div>

          <div style={{ padding: "14px 14px 10px", fontWeight: 700, fontSize: 14 }}>
            {settings.lang === "ko" ? "로비" : "Lobby"}
          </div>

          {!memberId ? (
            <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="input" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
              <input
                className="input"
                placeholder={settings.lang === "ko" ? "닉네임" : "Nickname"}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
              <input
                className="input"
                placeholder={settings.lang === "ko" ? "소속" : "Affiliation"}
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
              />

              <button className="submitBtn" style={{ marginTop: 0 }} onClick={joinAsMember}>
                {settings.lang === "ko" ? "참가" : "Join"}
              </button>

              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
                {settings.lang === "ko" ? "로비에서만 참가할 수 있어요." : "You can join only in the lobby."}
              </div>
            </div>
          ) : (
            <div style={{ padding: "0 14px 12px", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
              {settings.lang === "ko" ? "참가 완료! 시작을 기다려주세요." : "Joined! Waiting for start."}
            </div>
          )}

          <div style={{ padding: "0 14px 10px", fontSize: 12, color: "var(--muted)" }}>
            {settings.lang === "ko" ? "참가자" : "Participants"} ({members.length})
          </div>

          <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {members.length ? (
              members.map((m, idx) => (
                <div key={m.id} className="rowCard">
                  <div style={{ fontWeight: 700 }}>
                    {idx + 1}. {m.nickname || (settings.lang === "ko" ? "참가자" : "Player")}
                  </div>
                  <div className="rowMeta">{m.affiliation || "-"}</div>
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
            {settings.lang === "ko" ? "대기 중..." : "Waiting..."}
          </div>
        </div>

        <Toast message={toast} />
      </div>
    );
  }

  // running
  return (
    <div className="container">
      <div className="card" style={{ overflow: "auto", maxWidth: 360, margin: "0 auto" }}>
        <div className="headerRow">
          <div className="brand">SuDoKu ranking</div>
          <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{formatTime(elapsedSec)}</div>
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
                        <div key={k} className="memoDot">
                          {c.memos[k] ? k + 1 : ""}
                        </div>
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
            {Array.from({ length: 9 }, (_, k) => k + 1).map((n) => (
              <button key={n} className={"numBtn" + (numberDone[n] ? " done" : "")} onClick={() => applyNumber(n)}>
                {n}
              </button>
            ))}
            <button className="numBtn" onClick={erase}>
              {settings.lang === "ko" ? "지우기" : "Erase"}
            </button>
          </div>

          <div className="toolRow">
            <button className={"toolBtn" + (memoMode ? " on" : "")} onClick={() => setMemoMode((v) => !v)}>
              {settings.lang === "ko" ? "메모" : "Memo"}
            </button>
            <button className="toolBtn" onClick={undo} disabled={!undoStack.length}>
              {settings.lang === "ko" ? "되돌리기" : "Undo"}
            </button>
            <button className="toolBtn" onClick={redo} disabled={!redoStack.length}>
              {settings.lang === "ko" ? "다시하기" : "Redo"}
            </button>
            <button className="toolBtn" onClick={openAdmin}>
              {settings.lang === "ko" ? "관리" : "Manage"}
            </button>
          </div>
        </div>

        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {settings.lang === "ko" ? `점수: ${scoreInfo.total}` : `Score: ${scoreInfo.total}`}
          </div>

          <button className="submitBtn" disabled={!isSolved || submitted} onClick={submitResult}>
            {submitted ? (settings.lang === "ko" ? "제출 완료" : "Submitted") : settings.lang === "ko" ? "제출" : "Submit"}
          </button>

          {submitted ? (
            <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
              {settings.lang === "ko" ? "제출 완료! 다른 참가자를 기다리는 중..." : "Submitted! Waiting for others..."}
            </div>
          ) : null}
        </div>

        {adminOpen ? (
          <div className="modalOverlay" onClick={() => setAdminOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 800, marginBottom: 12 }}>{settings.lang === "ko" ? "관리" : "Manage"}</div>

              {isHostEffective ? (
                <>
                  <button className="submitBtn" style={{ marginTop: 0 }} onClick={resetMatchAsHost}>
                    {settings.lang === "ko" ? "다시 시작" : "Restart"}
                  </button>

                  <button className="submitBtn" style={{ marginTop: 10 }} onClick={endRoomAsHost}>
                    {settings.lang === "ko" ? "끝내기" : "End"}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {settings.lang === "ko" ? "방장만 사용할 수 있어요." : "Only host can use this."}
                </div>
              )}

              <button className="ghostBtn" style={{ marginTop: 12, width: "100%" }} onClick={() => setAdminOpen(false)}>
                {settings.lang === "ko" ? "닫기" : "Close"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Toast message={toast} />
    </div>
  );
}
