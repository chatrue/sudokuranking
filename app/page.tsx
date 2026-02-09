"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STR } from "@/lib/i18n";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings, type Difficulty } from "@/lib/settings";
import { SettingsModal } from "@/components/SettingsModal";
import { RankingsModal } from "@/components/RankingsModal";
import { Toast } from "@/components/Toast";
import { GroupHostModal } from "@/components/GroupHostModal";
import { pickPuzzle, puzzleToCells, type Cell, anyConflict, conflicts, getSameNumberIndexes, countNumber } from "@/lib/sudoku";
import { computeScore } from "@/lib/scoring";
import { formatTime } from "@/lib/time";

type HistoryState = { cells: Cell[] };

function deepCopyCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ value: c.value, given: c.given, memos: [...c.memos] }));
}

const DEVICE_ID_KEY = "sudoku_ranking_device_id_v1";
const SOLO_CURRENT_KEY = "sudoku_solo_current_v1";

function getKstDateStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function difficultyLabel(d: Difficulty, t: any) {
  return d === "easy" ? t.easy : d === "medium" ? t.medium : t.hard;
}

function drawSudokuPng(args: {
  difficulty: Difficulty;
  dateStr: string;
  cells: Cell[];
}) {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_not_supported");

  ctx.fillStyle = "#F5F6F8";
  ctx.fillRect(0, 0, W, H);

  const cardX = 70, cardY = 80, cardW = W - 140, cardH = H - 160;
  const rad = 36;

 function roundRect(x: number, y: number, w: number, h: number, r: number) {
  if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  ctx.save();
  ctx.shadowColor = "rgba(15,23,42,0.10)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#FFFFFF";
  roundRect(cardX, cardY, cardW, cardH, rad);
  ctx.fill();
  ctx.restore();

  // Title
  ctx.fillStyle = "#0F172A";
  ctx.font = "700 44px system-ui, -apple-system, 'Apple SD Gothic Neo', 'Pretendard', sans-serif";
  ctx.fillText("SuDoKu ranking", cardX + 44, cardY + 82);

  // Meta (date / difficulty / time)
  ctx.fillStyle = "rgba(100,116,139,0.95)";
  ctx.font = "650 30px system-ui, -apple-system, 'Apple SD Gothic Neo', 'Pretendard', sans-serif";
  const diffKo = difficultyLabel(args.difficulty, STR.ko);
  ctx.fillText(`${args.dateStr}`, cardX + 44, cardY + 142);
  ctx.fillText(`${diffKo}`, cardX + 44, cardY + 182);

  // Board
  const boardSize = 900;
  const bx = (W - boardSize) / 2;
  const by = cardY + 270;
  const cell = boardSize / 9;

  ctx.strokeStyle = "rgba(15,23,42,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, boardSize, boardSize);

  for (let i = 0; i <= 9; i++) {
    ctx.beginPath();
    ctx.lineWidth = i % 3 === 0 ? 4 : 1;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(15,23,42,0.22)" : "rgba(15,23,42,0.10)";
    ctx.moveTo(bx + i * cell, by);
    ctx.lineTo(bx + i * cell, by + boardSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = i % 3 === 0 ? 4 : 1;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(15,23,42,0.22)" : "rgba(15,23,42,0.10)";
    ctx.moveTo(bx, by + i * cell);
    ctx.lineTo(bx + boardSize, by + i * cell);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 81; i++) {
    const v = args.cells[i]?.value ?? 0;
    if (!v) continue;
    const rr = Math.floor(i / 9);
    const cc = i % 9;
    const cx = bx + cc * cell + cell / 2;
    const cy = by + rr * cell + cell / 2;

    ctx.fillStyle = args.cells[i].given ? "#0F172A" : "rgba(15,23,42,0.60)";
    ctx.font =
      (args.cells[i].given ? "800" : "780") +
      " 58px system-ui, -apple-system, 'Apple SD Gothic Neo', 'Pretendard', sans-serif";
    ctx.fillText(String(v), cx, cy + 2);
  }

  return canvas.toDataURL("image/png");
}

export default function Page() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const t = STR[settings.lang];

  const [totalVisits, setTotalVisits] = useState(0);
  const [todayVisits, setTodayVisits] = useState(0);

  const [totalScore, setTotalScore] = useState(0);
  const [lastSolvedScore, setLastSolvedScore] = useState(0);
  const solvedAwardedRef = useRef(false);

  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [puzzleId, setPuzzleId] = useState("");
  const [cells, setCells] = useState<Cell[]>([]);
  const [selected, setSelected] = useState(0);
  const [memoMode, setMemoMode] = useState(false);

  const [elapsedSec, setElapsedSec] = useState(0);

  // ✅ Tkinter(after) 스타일 타이머: setInterval 대신 setTimeout 체인
  const timerIdRef = useRef<number | null>(null);
  const timerRunningRef = useRef(false);

  const soloProgressKey = useMemo(() => (puzzleId ? `sudoku_solo_progress_${puzzleId}` : ""), [puzzleId]);
  const skipNextNewPuzzleRef = useRef(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  type RankingRow = { player_id: string; country: string | null };
  const [rankRows, setRankRows] = useState<RankingRow[]>([]);
  const [top1Row, setTop1Row] = useState<RankingRow | null>(null);
  const [rankLoading, setRankLoading] = useState(false);

  const [toast, setToast] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const toastRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastRef.current) window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(""), 2200);
  };

  const RECENT_SOL_KEY = (d: string) => `sudoku_recent_sol_${d}`;
  function loadRecentSol(d: string): string[] {
    try {
      const raw = localStorage.getItem(RECENT_SOL_KEY(d));
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  function saveRecentSol(d: string, sols: string[]) {
    try {
      localStorage.setItem(RECENT_SOL_KEY(d), JSON.stringify(sols.slice(0, 30)));
    } catch {}
  }

  const RECENT_KEY = (d: string) => `sudoku_recent_${d}`;
  function loadRecent(d: string): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY(d));
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  function saveRecent(d: string, ids: string[]) {
    try {
      localStorage.setItem(RECENT_KEY(d), JSON.stringify(ids.slice(0, 30)));
    } catch {}
  }

  const stopSoloTimer = useCallback(() => {
    timerRunningRef.current = false;
    if (timerIdRef.current !== null) {
      window.clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  const startSoloTimer = useCallback((reset: boolean) => {
    if (typeof window === "undefined") return;

    if (reset) setElapsedSec(0);

    // 기존 예약 취소(중복 방지)
    if (timerIdRef.current !== null) {
      window.clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }

    timerRunningRef.current = true;

    const tick = () => {
      if (!timerRunningRef.current) return;

      // 다음 tick 예약(항상 1개만 유지)
      timerIdRef.current = window.setTimeout(tick, 1000);

      const visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
      if (!visible) return;

      setElapsedSec((x) => x + 1);
    };

    timerIdRef.current = window.setTimeout(tick, 1000);
  }, []);

  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  const selectedValue = cells[selected]?.value ?? 0;

  const sameIndexes = useMemo(() => {
    if (!settings.highlightSameNumbers) return [];
    return getSameNumberIndexes(cells, selectedValue);
  }, [cells, selectedValue, settings.highlightSameNumbers]);

  const numberDone = useMemo(() => {
    if (!settings.showCompletedNumbers) return Array.from({ length: 10 }, () => false);
    const done = Array.from({ length: 10 }, () => false);
    for (let n = 1; n <= 9; n++) done[n] = countNumber(cells, n) >= 9;
    return done;
  }, [cells, settings.showCompletedNumbers]);

  const scoreInfoLive = useMemo(() => {
    return computeScore({
      difficulty,
      elapsedSec,
      highlightSameNumbers: settings.highlightSameNumbers,
      showCompletedNumbers: settings.showCompletedNumbers,
    });
  }, [difficulty, elapsedSec, settings.highlightSameNumbers, settings.showCompletedNumbers]);

  const isSolved = useMemo(() => {
    const allFilled = cells.length === 81 && cells.every((c) => c.value !== 0);
    if (!allFilled) return false;
    return !anyConflict(cells);
  }, [cells]);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);

    // ✅ 마지막 플레이(퍼즐/시간/칸) 복원
    if (typeof window !== "undefined") {
      try {
        const rawCur = localStorage.getItem(SOLO_CURRENT_KEY);
        if (rawCur) {
          const cur = JSON.parse(rawCur);
          if (cur && typeof cur === "object") {
            const savedDifficulty = cur?.difficulty as Difficulty | undefined;
            const savedPuzzleId = typeof cur?.puzzleId === "string" ? cur.puzzleId : "";
            const savedCells = Array.isArray(cur?.cells) && cur.cells.length === 81 ? (cur.cells as Cell[]) : null;
            const savedElapsed = Number.isFinite(cur?.elapsedSec) ? Math.max(0, Math.floor(cur.elapsedSec)) : null;

            if (savedPuzzleId && savedCells) {
              setDifficulty(
                savedDifficulty && (savedDifficulty === "easy" || savedDifficulty === "medium" || savedDifficulty === "hard")
                  ? savedDifficulty
                  : s.defaultDifficulty
              );
              setPuzzleId(savedPuzzleId);
              setCells(savedCells);
              setSelected(0);
              setMemoMode(false);
              setElapsedSec(savedElapsed ?? 0);
              setUndoStack([{ cells: deepCopyCells(savedCells) }]);
              setRedoStack([]);
              solvedAwardedRef.current = false;
              setLastSolvedScore(0);

              // 복원 직후에는 자동 새 퍼즐 생성(difficulty effect)을 1회 건너뛰기
              skipNextNewPuzzleRef.current = true;
            } else {
              setDifficulty(s.defaultDifficulty);
            }
          } else {
            setDifficulty(s.defaultDifficulty);
          }
        } else {
          setDifficulty(s.defaultDifficulty);
        }
      } catch {
        setDifficulty(s.defaultDifficulty);
      }
    } else {
      setDifficulty(s.defaultDifficulty);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // ✅ 기기별 유저 식별자(deviceId) 생성/유지 (랭킹/점수/방문자 기준)
    let deviceId = "";
    try {
      const saved = localStorage.getItem(DEVICE_ID_KEY);
      if (saved && typeof saved === "string") deviceId = saved;
      if (!deviceId) {
        deviceId = (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
    } catch {
      deviceId = String(Date.now()) + "_" + Math.random().toString(16).slice(2);
    }

    // ✅ 서버 방문자(유니크) 기록 + 서버 누적 점수/방문자수 동기화
    (async () => {
      try {
        const res = await fetch("/api/visit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        const json = await res.json();
        if (json?.ok) {
          setTotalVisits(Number(json.total ?? 0) || 0);
          setTodayVisits(Number(json.today ?? 0) || 0);
          setTotalScore(Number(json.myScore ?? 0) || 0);
        }
      } catch {}
    })();
  }, []);

  
  useEffect(() => {
    if (skipNextNewPuzzleRef.current) {
      skipNextNewPuzzleRef.current = false;
      return;
    }
    startNewPuzzle(difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  // ✅ 퍼즐마다 진행상황 복원 + 타이머 시작
  useEffect(() => {
    if (typeof window === "undefined") return;
    stopSoloTimer();

    // 퍼즐 진행(칸/시간) 복원
    try {
      if (soloProgressKey) {
        const raw = localStorage.getItem(soloProgressKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.puzzleId === puzzleId) {
            if (Array.isArray(parsed?.cells) && parsed.cells.length === 81) setCells(parsed.cells);
            if (Number.isFinite(parsed?.elapsedSec)) setElapsedSec(Math.max(0, Math.floor(parsed.elapsedSec)));
          }
        }
      }
    } catch {}

    if (puzzleId) startSoloTimer(false);

    return () => stopSoloTimer();
  }, [puzzleId, soloProgressKey, startSoloTimer, stopSoloTimer]);

  // ✅ 진행상황 저장(디바운스)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!puzzleId || !soloProgressKey) return;

    const tid = window.setTimeout(() => {
      try {
        localStorage.setItem(soloProgressKey, JSON.stringify({ puzzleId, elapsedSec, cells }));
      } catch {}
      try {
        localStorage.setItem(SOLO_CURRENT_KEY, JSON.stringify({ difficulty, puzzleId, elapsedSec, cells }));
      } catch {}
    }, 200);

    return () => window.clearTimeout(tid);
  }, [difficulty, puzzleId, soloProgressKey, elapsedSec, cells]);

  function pushUndo(nextCells: Cell[]) {
    setUndoStack((st) => [...st, { cells: deepCopyCells(nextCells) }].slice(-120));
    setRedoStack([]);
  }

  function startNewPuzzle(d: Difficulty) {
    stopSoloTimer();
    const p = pickPuzzle(d);
    const init = puzzleToCells(p);
    setPuzzleId(p.id);
    setCells(init);
    setSelected(0);
    setMemoMode(false);
    setElapsedSec(0);
    startSoloTimer(true);
    setUndoStack([{ cells: deepCopyCells(init) }]);
    setRedoStack([]);
    solvedAwardedRef.current = false;
    setLastSolvedScore(0);
  }

  function awardIfSolved(nextCells: Cell[]) {
    const allFilled = nextCells.length === 81 && nextCells.every((c) => c.value !== 0);
    if (!allFilled) return;

    for (let i = 0; i < 81; i++) {
      if (conflicts(nextCells, i)) return;
    }
    if (solvedAwardedRef.current) return;

    const final = computeScore({
      difficulty,
      elapsedSec,
      highlightSameNumbers: settings.highlightSameNumbers,
      showCompletedNumbers: settings.showCompletedNumbers,
    }).total;

    solvedAwardedRef.current = true;
    setLastSolvedScore(final);

    showToast(t.toastSolvedPts.replace("{pts}", String(final)));
  }

  function applyNumber(n: number) {
    const cur = cells[selected];
    if (!cur || cur.given) return;

    const next = deepCopyCells(cells);

    if (memoMode) {
      next[selected].memos[n - 1] = !next[selected].memos[n - 1];
    } else {
      next[selected].value = n;
      next[selected].memos = Array.from({ length: 9 }, () => false);
    }

    setCells(next);
    pushUndo(next);
    awardIfSolved(next);
  }

  function erase() {
    const cur = cells[selected];
    if (!cur || cur.given) return;

    const next = deepCopyCells(cells);
    next[selected].value = 0;
    next[selected].memos = Array.from({ length: 9 }, () => false);
    setCells(next);
    pushUndo(next);
  }

  function undo() {
    setUndoStack((st) => {
      if (st.length <= 1) return st;
      const nextSt = st.slice(0, -1);
      const last = nextSt[nextSt.length - 1];
      setRedoStack((rs) => [{ cells: deepCopyCells(st[st.length - 1].cells) }, ...rs].slice(0, 120));
      setCells(deepCopyCells(last.cells));
      return nextSt;
    });
  }

  function redo() {
    setRedoStack((rs) => {
      if (rs.length === 0) return rs;
      const [first, ...rest] = rs;
      setUndoStack((st) => [...st, { cells: deepCopyCells(first.cells) }].slice(-120));
      setCells(deepCopyCells(first.cells));
      awardIfSolved(first.cells);
      return rest;
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as any)?.tagName?.toLowerCase?.();
      if (tag === "input" || tag === "textarea") return;

      const k = e.key;

      if (k >= "1" && k <= "9") {
        e.preventDefault();
        applyNumber(Number(k));
        return;
      }

      if (k === "Backspace" || k === "Delete" || k === "0") {
        e.preventDefault();
        erase();
        return;
      }

      if (k === "m" || k === "M") {
        e.preventDefault();
        setMemoMode((v) => !v);
        return;
      }

      if (k === "ArrowLeft") { e.preventDefault(); setSelected((i) => Math.max(0, i - 1)); return; }
      if (k === "ArrowRight") { e.preventDefault(); setSelected((i) => Math.min(80, i + 1)); return; }
      if (k === "ArrowUp") { e.preventDefault(); setSelected((i) => Math.max(0, i - 9)); return; }
      if (k === "ArrowDown") { e.preventDefault(); setSelected((i) => Math.min(80, i + 9)); return; }

      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (k.toLowerCase() === "y" || (e.shiftKey && k.toLowerCase() === "z"))) { e.preventDefault(); redo(); return; }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, selected, memoMode, undoStack.length, redoStack.length, elapsedSec, difficulty, settings.highlightSameNumbers, settings.showCompletedNumbers]);

  async function fetchTop1() {
    try {
      const res = await fetch(`/api/rankings`, { cache: "no-store" });
      const json = await res.json();
      const rows = json?.rows ?? [];
      setTop1Row(rows.length ? rows[0] : null);
    } catch {
      setTop1Row(null);
    }
  }

  async function openRankings() {
    setRankOpen(true);
    setRankLoading(true);
    try {
      const res = await fetch(`/api/rankings`, { cache: "no-store" });
      const json = await res.json();
      setRankRows(json?.rows ?? []);
    } catch {
      setRankRows([]);
    } finally {
      setRankLoading(false);
    }
  }

  useEffect(() => {
    fetchTop1();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!settings.playerId.trim()) {
      showToast(t.requiredId);
      setSettingsOpen(true);
      return;
    }
    if (!isSolved) {
      showToast(t.notSolved);
      return;
    }

    const submitScore = solvedAwardedRef.current ? lastSolvedScore : scoreInfoLive.total;

    // ✅ deviceId(기기 고유) = 서버 집계 기준
    const deviceId = (() => {
      try { return localStorage.getItem(DEVICE_ID_KEY) || ""; } catch { return ""; }
    })();

    const payload = {
      deviceId,
      playerId: settings.playerId.trim(),
      country: settings.country.trim(),
      lang: settings.lang,
      difficulty,
      timeMs: elapsedSec * 1000,
      score: submitScore,
      puzzleId,
    };

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "submit_failed");
      showToast(t.submitted);

      // ✅ 제출 성공 후: 서버 기준(점수/방문자/내 누적 점수) 재동기화
      try {
        const r2 = await fetch("/api/visit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        const j2 = await r2.json();
        if (j2?.ok) {
          setTotalVisits(Number(j2.total ?? 0) || 0);
          setTodayVisits(Number(j2.today ?? 0) || 0);
          setTotalScore(Number(j2.myScore ?? 0) || 0);
        }
      } catch {}

      // ✅ 1등 정보 갱신 + 랭킹(Top1) 모달 열기
      fetchTop1();
      openRankings();
    } catch (e: any) {
      showToast(t.toastSubmitFail.replace("{msg}", String(e?.message ?? "unknown")));
    }
  }

  function saveSettingsAndClose() {
    const next = { ...settings, country: settings.country.trim() ? settings.country.trim() : (settings.lang === "ko" ? "대한민국" : "") };
    setSettings(next);
    saveSettings(next);
    setDifficulty(next.defaultDifficulty);
    setSettingsOpen(false);
    showToast(t.toastSaved);
  }

  function exportProblemPng() {
    try {
      const dateStr = getKstDateStr();
      const dataUrl = drawSudokuPng({ difficulty, dateStr, cells });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `sudoku_${dateStr}_${difficulty}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(t.toastProblemSaved);
    } catch {
      showToast(t.toastSaveFail);
    }
  }

  const diffLabel = difficultyLabel(difficulty, t);

  return (
    <div className="container">
      <div className="card">
        <div className="headerRow">
          <div className="brand">{t.brand}</div>
          <button className="iconBtn" onClick={() => setSettingsOpen(true)} aria-label={t.settings}>⚙</button>
        </div>

        <div className="topInfo">
          <div className="compactTop"><div className="infoGrid">
            <div className="infoItem">
              <div className="label">{t.id}</div>
              <div className="valueSmall">{settings.playerId ? settings.playerId : "—"}</div>
            </div>

            <div className="infoItem">
              <div className="label">{t.score}</div>
              <div className="value">{totalScore}</div>
            </div>

            <button className="pillBtn" onClick={() => openRankings()} aria-label={t.ranking}>
              <div className="pillLeft">
                <div className="pillTitle">{t.ranking}</div>
                <div className="pillValue">{top1Row ? `${top1Row.player_id}${top1Row.country ? ` - ${top1Row.country}` : ""}` : "—"}</div>
              </div>
              <div style={{ color: "var(--muted)" }}>›</div>
            </button>
          </div>

          <div className="infoGrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="infoItem" style={{ padding: "8px 12px", display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.difficulty}</div>
              <div style={{ fontSize: 13, fontWeight: 850 }}>{diffLabel}</div>
            </div>
            <div className="infoItem" style={{ padding: "8px 12px", display: "flex", alignItems: "baseline", gap: 10, justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.time}</div>
              <div style={{ fontSize: 13, fontWeight: 850 }}>{formatTime(elapsedSec)}</div>
            </div>
          </div>
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

              const cls = [
                "cell",
                thickR ? "thickR" : "",
                thickB ? "thickB" : "",
                isSel ? "selected" : "",
                isSame ? "same" : "",
              ].filter(Boolean).join(" ");

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
            <button className="textAction" onClick={undo} disabled={undoStack.length <= 1}>{t.undo}</button>
            <button className="textAction" onClick={redo} disabled={redoStack.length === 0}>{t.redo}</button>
            <button className="textAction" onClick={() => setMemoMode(!memoMode)}>
              {memoMode ? <span className="blinkText">{t.memo} {t.memoOn}</span> : <span>{t.memo} {t.memoOff}</span>}
            </button>
            <button className="textAction" onClick={erase}>{t.erase}</button>
            <button className="textAction" onClick={() => startNewPuzzle(difficulty)}>{t.newPuzzle}</button>
          </div>
        </div>

        <div className="submitWrap">
          {memoMode ? (
            <div style={{ marginBottom: 10, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{t.memoHint}</div>
          ) : null}

          <button className="submitBtn" onClick={submit} disabled={!isSolved}>
            {t.submit}
          </button>

          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            {t.submitRule}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>{t.scorePolicy}</div>
</div>

        <div className="bottomBar">
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {t.total} {totalVisits} · {t.today} {todayVisits}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="linkBtn" onClick={() => setGroupOpen(true)}>{t.groupPlay}</button>
            <button className="linkBtn" onClick={exportProblemPng}>{t.problemSave}</button>
          </div>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettingsAndClose}
      />

      <RankingsModal
  open={rankOpen}
  settings={settings}
  rows={rankRows}
  loading={rankLoading}
  onClose={() => setRankOpen(false)}
/>


      <GroupHostModal open={groupOpen} settings={settings} onCloseToPersonal={() => setGroupOpen(false)} />

      <Toast message={toast} />
    </div>
  );
}
