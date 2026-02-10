// app/api/rooms/_store.ts
import { supabaseServer } from "@/lib/supabaseServer";
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
  affiliation: string;
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

function toMs(v: any): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function nowMs() {
  return Date.now();
}

function defaultConfig(): RoomConfig {
  return {
    difficulty: "easy",
    highlightSameNumbers: true,
    showCompletedNumbers: true,
  };
}

/** 만료된 방 정리(선택) */
export async function cleanup() {
  const nowIso = new Date().toISOString();
  // expires_at < now() 인 방 삭제 (FK CASCADE로 members/results도 같이 삭제)
  await supabaseServer.from("game_rooms").delete().lt("expires_at", nowIso);
}

export async function createRoom(): Promise<{ room: Room }> {
  await cleanup();

  const id = randId(6);
  const hostToken = randToken(32);
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const createdAt = nowMs();
  const expiresAt = createdAt + 3 * 60 * 60 * 1000;

  const config = defaultConfig();

  const { error } = await supabaseServer.from("game_rooms").insert({
    id,
    host_token: hostToken,
    pin,
    status: "lobby",
    created_at: new Date(createdAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    config,
    puzzle_id: null,
    puzzle_data: null,
    started_at: null,
    ended_at: null,
  });

  if (error) throw new Error(error.message);

  return {
    room: {
      id,
      hostToken,
      pin,
      status: "lobby",
      createdAt,
      expiresAt,
      config,
      members: [],
      puzzleId: null,
      puzzleData: null,
      startedAt: null,
      endedAt: null,
      results: [],
    },
  };
}

export async function getRoom(id: string): Promise<Room | null> {
  const { data: roomRow, error: roomErr } = await supabaseServer
    .from("game_rooms")
    .select("id, host_token, pin, status, created_at, expires_at, config, puzzle_id, puzzle_data, started_at, ended_at")
    .eq("id", id)
    .maybeSingle();

  if (roomErr) throw new Error(roomErr.message);
  if (!roomRow) return null;

  const { data: members, error: memErr } = await supabaseServer
    .from("game_room_members")
    .select("id, nickname, affiliation, joined_at")
    .eq("room_id", id)
    .order("joined_at", { ascending: true });

  if (memErr) throw new Error(memErr.message);

  const { data: results, error: resErr } = await supabaseServer
    .from("game_room_results")
    .select("member_id, nickname, affiliation, score, time_ms, submitted_at")
    .eq("room_id", id)
    .order("submitted_at", { ascending: true });

  if (resErr) throw new Error(resErr.message);

  return {
    id: roomRow.id,
    hostToken: roomRow.host_token,
    pin: roomRow.pin,
    status: roomRow.status as RoomStatus,
    createdAt: toMs(roomRow.created_at) ?? nowMs(),
    expiresAt: toMs(roomRow.expires_at) ?? nowMs(),
    config: (roomRow.config as any) ?? defaultConfig(),
    members: (members ?? []).map((m) => ({
      id: m.id,
      nickname: m.nickname,
      affiliation: m.affiliation,
      joinedAt: toMs(m.joined_at) ?? nowMs(),
    })),
    puzzleId: roomRow.puzzle_id ?? null,
    puzzleData: roomRow.puzzle_data ?? null,
    startedAt: toMs(roomRow.started_at),
    endedAt: toMs(roomRow.ended_at),
    results: (results ?? []).map((r) => ({
      memberId: r.member_id,
      nickname: r.nickname,
      affiliation: r.affiliation,
      score: r.score,
      timeMs: r.time_ms,
      submittedAt: toMs(r.submitted_at) ?? nowMs(),
    })),
  };
}

export function requireHost(room: Room, token: string | null) {
  if (!token || token !== room.hostToken) throw new Error("host_only");
}

export async function joinRoom(roomId: string, nickname: string, affiliation: string, pin: string) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("not_found");

  if (room.status !== "lobby") throw new Error("not_in_lobby");
  if (pin !== room.pin) throw new Error("bad_pin");

  const nn = nickname.trim();
  const aff = affiliation.trim();

  if (!nn) throw new Error("nickname_required");
  if (!aff) throw new Error("affiliation_required");

  // 같은 닉네임 중복 방지(원하면 제거 가능)
  if (room.members.some((m) => m.nickname === nn)) throw new Error("nickname_taken");

  const memberId = randToken(12);

  const { error } = await supabaseServer.from("game_room_members").insert({
    id: memberId,
    room_id: roomId,
    nickname: nn,
    affiliation: aff,
    joined_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  return { id: memberId };
}

export async function updateConfig(roomId: string, hostToken: string, patch: Partial<RoomConfig>) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("not_found");
  requireHost(room, hostToken);

  if (room.status !== "lobby") throw new Error("config_locked");

  const next: RoomConfig = { ...room.config, ...patch };

  const { error } = await supabaseServer
    .from("game_rooms")
    .update({ config: next })
    .eq("id", roomId);

  if (error) throw new Error(error.message);

  return await getRoom(roomId);
}

export async function startRoom(roomId: string, hostToken: string) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("not_found");
  requireHost(room, hostToken);

  if (room.status !== "lobby") throw new Error("already_started");

  const { id: puzzleId, puzzle } = pickPuzzle(room.config.difficulty);

  const startedAtIso = new Date().toISOString();

  const { error } = await supabaseServer
    .from("game_rooms")
    .update({
      status: "running",
      puzzle_id: puzzleId,
      puzzle_data: puzzle,
      started_at: startedAtIso,
      ended_at: null,
    })
    .eq("id", roomId);

  if (error) throw new Error(error.message);

  return await getRoom(roomId);
}

export async function submitResult(roomId: string, memberId: string, score: number, timeMs: number) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("not_found");

  if (room.status !== "running") throw new Error("not_running");

  const member = room.members.find((m) => m.id === memberId);
  if (!member) throw new Error("member_not_found");

  const { error } = await supabaseServer.from("game_room_results").upsert(
    {
      room_id: roomId,
      member_id: memberId,
      nickname: member.nickname,
      affiliation: member.affiliation,
      score: Math.max(0, Math.floor(score)),
      time_ms: Math.max(0, Math.floor(timeMs)),
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "room_id,member_id" }
  );

  if (error) throw new Error(error.message);

  return await getRoom(roomId);
}

export async function endRoom(roomId: string, hostToken: string) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("not_found");
  requireHost(room, hostToken);

  if (room.status === "ended") return room;

  const { error } = await supabaseServer
    .from("game_rooms")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", roomId);

  if (error) throw new Error(error.message);

  return await getRoom(roomId);
}

export async function resetRoom(roomId: string, hostToken?: string | null) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("not_found");

  // reset은 호스트만 허용하고 싶으면 아래 2줄을 사용
  if (hostToken != null) requireHost(room, hostToken);

  if (room.status !== "ended" && room.status !== "lobby") throw new Error("cannot_reset_now");

  // 결과만 초기화, 멤버는 유지(원하면 멤버도 삭제 가능)
  const { error: rErr } = await supabaseServer.from("game_room_results").delete().eq("room_id", roomId);
  if (rErr) throw new Error(rErr.message);

  const { error: roomErr } = await supabaseServer
    .from("game_rooms")
    .update({
      status: "lobby",
      puzzle_id: null,
      puzzle_data: null,
      started_at: null,
      ended_at: null,
    })
    .eq("id", roomId);

  if (roomErr) throw new Error(roomErr.message);

  return await getRoom(roomId);
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
