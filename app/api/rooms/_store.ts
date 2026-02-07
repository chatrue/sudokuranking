// app/api/rooms/_store.ts
import { pickPuzzle } from "@/lib/sudoku";
import type { Difficulty } from "@/lib/settings";

export type RoomStatus = "lobby" | "running" | "ended";

export type RoomConfig = {
  difficulty: Difficulty;
  highlightSameNumbers: boolean;
  showCompletedNumbers: boolean;
};

export type RoomMember = {
  id: string;
  nickname: string;
  affiliation: string; // 출신 국가 또는 소속
  joinedAt: number;
};

export type RoomResult = {
  memberId: string;
  nickname: string;
  affiliation: string;
  score: number;
  timeMs: number;
  submittedAt: number;
};

export type Room = {
  id: string;
  hostToken: string;
  pin: string;
  status: RoomStatus;
  createdAt: number;
  expiresAt: number;

  config: RoomConfig;

  members: RoomMember[];
  puzzleId: string | null;
  puzzleData: any | null;
  startedAt: number | null;
  endedAt: number | null;

  results: RoomResult[];
};

function randId(n: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function randToken(n: number) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function now() {
  return Date.now();
}

function getStore(): Map<string, Room> {
  const g: any = globalThis as any;
  if (!g.__SUDOKU_ROOMS__) g.__SUDOKU_ROOMS__ = new Map<string, Room>();
  return g.__SUDOKU_ROOMS__ as Map<string, Room>;
}

export function cleanup() {
  const store = getStore();
  const t = now();
  for (const [id, room] of store.entries()) {
    if (room.expiresAt <= t) store.delete(id);
  }
}

export function createRoom(): { room: Room } {
  cleanup();
  const id = randId(6);
  const hostToken = randToken(32);
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const createdAt = now();
  const expiresAt = createdAt + 3 * 60 * 60 * 1000;

  const room: Room = {
    id,
    hostToken,
    pin,
    status: "lobby",
    createdAt,
    expiresAt,
    config: {
      difficulty: "easy",
      // QR 로비(함께 즐기기) 기본 옵션: 같은 숫자 보임/완성 숫자 표시 = 켬
      highlightSameNumbers: true,
      showCompletedNumbers: true,
    },
    members: [],
    puzzleId: null,
    puzzleData: null,
    startedAt: null,
    endedAt: null,
    results: [],
  };

  getStore().set(id, room);
  return { room };
}

export function getRoom(id: string): Room | null {
  cleanup();
  return getStore().get(id) ?? null;
}

export function requireHost(room: Room, token: string | null) {
  if (!token || token !== room.hostToken) throw new Error("forbidden");
}

export function joinRoom(room: Room, nickname: string, affiliation: string, pin: string) {
  if (room.status !== "lobby") throw new Error("room_not_lobby");
  if (pin !== room.pin) throw new Error("bad_pin");

  const id = randToken(10);
  const nick = nickname.trim().slice(0, 20) || "Anonymous";
  const aff = affiliation.trim().slice(0, 30);

  const base = nick;
  let finalNick = base;
  let k = 2;
  const existing = new Set(room.members.map((m) => m.nickname));
  while (existing.has(finalNick)) {
    finalNick = `${base}(${k})`;
    k++;
  }

  const member = { id, nickname: finalNick, affiliation: aff, joinedAt: now() };
  room.members.push(member);
  room.expiresAt = Math.max(room.expiresAt, now() + 60 * 60 * 1000);
  return member;
}

export function updateConfig(room: Room, patch: Partial<RoomConfig>) {
  if (room.status !== "lobby") throw new Error("room_not_lobby");
  room.config = { ...room.config, ...patch };
}

export function startRoom(room: Room) {
  if (room.status !== "lobby") throw new Error("bad_state");
  const p = pickPuzzle(room.config.difficulty);
  room.puzzleId = p.id;
  room.puzzleData = p;
  room.startedAt = now();
  room.status = "running";
  room.results = [];
}

export function submitResult(room: Room, memberId: string, score: number, timeMs: number) {
  if (room.status !== "running") throw new Error("not_running");
  const m = room.members.find((x) => x.id === memberId);
  if (!m) throw new Error("no_member");
  if (room.results.some((r) => r.memberId === memberId)) throw new Error("already_submitted");

  room.results.push({
    memberId,
    nickname: m.nickname,
    affiliation: m.affiliation,
    score: Math.max(0, Math.floor(score)),
    timeMs: Math.max(0, Math.floor(timeMs)),
    submittedAt: now(),
  });
}

export function endRoom(room: Room) {
  if (room.status !== "running") throw new Error("bad_state");
  room.status = "ended";
  room.endedAt = now();
  room.expiresAt = now() + 30 * 60 * 1000;
}

export function getPublicState(room: Room) {
  return {
    id: room.id,
    status: room.status,
    createdAt: room.createdAt,
    config: room.config,
    members: room.members.map((m) => ({ id: m.id, nickname: m.nickname, affiliation: m.affiliation })),
    puzzleId: room.puzzleId,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
    results: room.results,
    pinHint: room.pin.slice(0, 2) + "••••",
  };
}


export function resetRoom(room: Room) {
  // Allow starting a new match in the same room.
  room.status = "lobby";
  room.puzzleId = null;
  room.puzzleData = null;
  room.startedAt = null;
  room.endedAt = null;
  room.results = [];
  // Keep members so the same group can continue without re-joining.
}
