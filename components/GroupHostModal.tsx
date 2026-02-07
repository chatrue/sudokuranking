"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCanvas } from "@/components/QRCanvas";
import { STR } from "@/lib/i18n";
import type { Difficulty, AppSettings } from "@/lib/settings";

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

type Props = {
  open: boolean;
  settings: AppSettings;
  onCloseToPersonal: () => void;
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function GroupHostModal({ open, settings, onCloseToPersonal }: Props) {
  const t = STR[settings.lang];
  const router = useRouter();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [lanOrigin, setLanOrigin] = useState<string | null>(null);

  const [state, setState] = useState<PublicState | null>(null);
  const [loading, setLoading] = useState(false);

  const pollRef = useRef<number | null>(null);

  const inviteUrl = useMemo(() => {
    if (!roomId) return "";
    if (typeof window === "undefined") return "";
    const origin = lanOrigin ?? window.location.origin;
    return `${origin}/g/${roomId}`;
  }, [roomId, lanOrigin]);

  async function createRoom() {
    setLoading(true);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "create_failed");
      setRoomId(json.roomId);
      setHostToken(json.hostToken);
      setPin(json.pin);
      try { localStorage.setItem(`sudoku_host_${json.roomId}`, String(json.hostToken)); } catch {}
      try { localStorage.setItem(`sudoku_pin_${json.roomId}`, String(json.pin)); } catch {}
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchState() {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) setState(json.state);
    } catch {}
  }

  useEffect(() => {
    // 로컬(PC)에서 QR을 폰으로 찍을 때 localhost가 막히는 문제 해결:
    // 가능한 경우 PC의 LAN IP로 초대 링크를 구성합니다.
    if (open && typeof window !== "undefined") {
      const h = window.location.hostname;
      if (h === "localhost" || h === "127.0.0.1") {
        fetch("/api/netinfo", { cache: "no-store" })
          .then((r) => r.json())
          .then((j) => {
            if (j?.ok && j?.ip) setLanOrigin(`http://${j.ip}:${window.location.port}`);
          })
          .catch(() => {});
      }
    }

    if (!open) return;
    if (!roomId) createRoom();
    pollRef.current = window.setInterval(fetchState, 1200);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomId]);

  useEffect(() => {
    if (!open) return;
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, open]);

  async function patchConfig(patch: Partial<PublicState["config"]>) {
    if (!roomId || !hostToken) return;
    try {
      await fetch(`/api/rooms/${roomId}/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken, ...patch }),
      });
      await fetchState();
    } catch {}
  }

  async function start() {
    if (!roomId || !hostToken) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg = String(json?.error || "start_failed");
        alert(settings.lang === "ko" ? `시작 실패: ${msg}` : `Start failed: ${msg}`);
        return;
      }
      await fetchState();
    } catch (e: any) {
      alert(settings.lang === "ko" ? "시작 실패" : "Start failed");
    } finally {
      setLoading(false);
    }
  }

  async function hostJoinAndStart() {
    if (!roomId || !pin || !hostToken) return;
    setLoading(true);
    try {
      // 1) Host joins as a player
      const nickname = settings.lang === "ko" ? "방장" : "Host";
      const resJoin = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, affiliation: "", pin }),
      });
      const joinJson = await resJoin.json().catch(() => null);
      if (!resJoin.ok || !joinJson?.ok) {
        const msg = String(joinJson?.error || "join_failed");
        alert(settings.lang === "ko" ? `참가 실패: ${msg}` : `Join failed: ${msg}`);
        return;
      }
      try {
        localStorage.setItem(`sudoku_member_${roomId}`, String(joinJson.memberId));
      } catch {}

      // 2) Start match (host authority)
      const resStart = await fetch(`/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken }),
      });
      const startJson = await resStart.json().catch(() => null);
      if (!resStart.ok || !startJson?.ok) {
        const msg = String(startJson?.error || "start_failed");
        alert(settings.lang === "ko" ? `시작 실패: ${msg}` : `Start failed: ${msg}`);
        return;
      }

      await fetchState();
      router.push(`/g/${roomId}?host=1`);
    } catch (e: any) {
      alert(settings.lang === "ko" ? "실행 실패" : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function end() {
    if (!roomId || !hostToken) return;
    try {
      await fetch(`/api/rooms/${roomId}/end`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostToken }),
      });
      await fetchState();
    } catch {}
  }

  async function resetMatch() {
    if (!roomId) return;
    setLoading(true);
    try {
      await fetch(`/api/rooms/${roomId}/reset`, { method: "POST" });
      await fetchState();
    } finally {
      setLoading(false);
    }
  }

  async function shareInvite() {
    if (!inviteUrl) return;
    const text = settings.lang === "ko"
      ? `오늘 경기방 초대
PIN: ${pin}
${inviteUrl}`
      : `Invite to today's match
PIN: ${pin}
${inviteUrl}`;

    
    const nav: any = navigator as any;
    if (nav?.share) {
      try {
        await nav.share({ title: settings.lang === "ko" ? "오늘 경기방" : "Today's match", text, url: inviteUrl });
        return;
      } catch {}
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        alert(settings.lang === "ko" ? "초대 문구를 복사했어요" : "Invitation copied.");
        return;
      }
    } catch {}
    // Fallback for http/older browsers: execCommand copy
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        alert(settings.lang === "ko" ? "초대 문구를 복사했어요" : "Invitation copied.");
        return;
      }
    } catch {}
    alert(text);
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

  const startedAt = state?.startedAt ?? null;
  const elapsedSec = useMemo(() => {
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }, [startedAt]);

  if (!open) return null;

  return (
    <div className="modalOverlay">
      <div className="modalCard" style={{ maxWidth: 520 }}>
        <div className="headerRow">
          <div className="brand">SuDoKu ranking</div>
          <button className="iconBtn" onClick={onCloseToPersonal} aria-label="close">✕</button>
        </div>

        {!roomId || loading ? <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>{t.creating}</div> : null}

        {roomId && pin ? (
          <div style={{ marginTop: 14 }}>
            <div className="infoItem" style={{ padding: "14px 12px", display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ background: "#fff", padding: 12, borderRadius: 18 }}>
                <QRCanvas value={inviteUrl} size={148} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.openWithQr}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>PIN</div>
                <div className="pinRow">
                  <div className="pinValue">{pin}</div>
                  <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 260 }}>
                    <button className="iconBtn" style={{ flex: 1, height: 38, minWidth: 0 }} onClick={shareInvite}>
                      {t.sendInvite}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                {t.wifiNote}
              </div>
            ) : null}

            {state ? (
              <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                {/* 난이도 옵션은 한 줄 전체를 쓰도록(중앙 치우침 방지) */}
                <div className="infoGrid" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="infoItem" style={{ padding: "10px 12px" }}>
                    <div className="label">{t.difficultyLabel}</div>
                    <select
                      className="input"
                      value={state.config.difficulty}
                      disabled={state.status !== "lobby"}
                      onChange={(e) => patchConfig({ difficulty: e.target.value as any })}
                    >
                      <option value="easy">{t.easy}</option>
                      <option value="medium">{t.medium}</option>
                      <option value="hard">{t.hard}</option>
                      <option value="pro">{t.pro}</option>
                      <option value="insane">{t.insane}</option>
                    </select>
                  </div>
                </div>

                <div className="optRow">
                  <div className="infoItem" style={{ padding: "12px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.showSame}</div>
                    <button
                      className={"ctrlBtn " + (state.config.highlightSameNumbers ? "toggleOn" : "")}
                      disabled={state.status !== "lobby"}
                      onClick={() => patchConfig({ highlightSameNumbers: !state.config.highlightSameNumbers })}
                    >
                      {state.config.highlightSameNumbers ? t.enabled : t.disabled}
                    </button>
                  </div>

                  <div className="infoItem" style={{ padding: "12px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.showCompletedDigits}</div>
                    <button
                      className={"ctrlBtn " + (state.config.showCompletedNumbers ? "toggleOn" : "")}
                      disabled={state.status !== "lobby"}
                      onClick={() => patchConfig({ showCompletedNumbers: !state.config.showCompletedNumbers })}
                    >
                      {state.config.showCompletedNumbers ? t.enabled : t.disabled}
                    </button>
                  </div>
                </div>

                <div className="infoItem" style={{ padding: "12px 12px" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.participantsCount.replace("{n}", String(state.members.length))}</div>
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {state.members.length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.noParticipants}</div>
                    ) : (
                      state.members.map((m) => (
                        <div key={m.id} style={{ fontWeight: 850 }}>{m.nickname}</div>
                      ))
                    )}
                  </div>
                </div>

                {state.status === "lobby" ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                    <button
                      className="submitBtn"
                      style={{ flex: 1, marginTop: 0, background: "rgba(245,246,248,0.8)", color: "var(--text)", border: "1px solid var(--border)" }}
                      onClick={start}
                      disabled={loading || state.members.length === 0}
                    >
                      {t.startMatch}
                    </button>
                    <button
                      className="submitBtn"
                      style={{ flex: 1, marginTop: 0 }}
                      onClick={hostJoinAndStart}
                      disabled={loading || !roomId || !pin}
                    >
                      {t.hostJoins}
                    </button>
                  </div>
                ) : state.status === "running" ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="infoItem" style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {t.progressTime.replace("{t}", fmt(elapsedSec))}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {t.submissionsCount
                          .replace("{a}", String(state.results.length))
                          .replace("{b}", String(state.members.length))}
                      </div>
                    </div>
                    <button className="submitBtn" style={{ maxWidth: 320, marginLeft: "auto", marginRight: "auto" }} onClick={end}>
                      {t.endMatchBtn}
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.notSaved}</div>

                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      {ranked.length === 0 ? (
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.noSubmitted}</div>
                      ) : (
                        ranked.map((r, i) => (
                          <div
                            key={r.memberId}
                            className="infoItem"
                            style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
                          >
                            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                              <div style={{ width: 18, fontWeight: 900 }}>{i + 1}</div>
                              <div style={{ fontWeight: 850 }}>{r.nickname}</div>
                            </div>
                            <div style={{ fontWeight: 900 }}>{t.points.replace("{p}", String(r.score))}</div>
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                      <button className="submitBtn" onClick={resetMatch}>
                        {t.restart}
                      </button>
                      <button className="submitBtn" onClick={onCloseToPersonal}>
                        {t.exitGame}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
                {t.loadingEllipsis}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}