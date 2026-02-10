import { NextResponse } from "next/server";
import { joinRoom } from "../../_store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pickString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

export async function POST(req: Request, context: any) {
  const roomId = pickString(context?.params?.roomId);

  if (!roomId) {
    return NextResponse.json(
      { ok: false, error: "bad_room_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const body = await req.json().catch(() => ({} as any));

  // ✅ 기존 클라이언트가 어떤 키로 보내든 최대한 받아주기(호환성)
  const nickname =
    pickString(body.nickname) ||
    pickString(body.name) ||
    pickString(body.userName) ||
    pickString(body.username) ||
    pickString(body.user_id) ||
    pickString(body.userId);

  const affiliation =
    pickString(body.affiliation) ||
    pickString(body.aff) ||
    pickString(body.org) ||
    pickString(body.organization) ||
    pickString(body.team) ||
    pickString(body.group);

  const pin =
    pickString(body.pin) ||
    pickString(body.roomPin) ||
    pickString(body.room_pin) ||
    pickString(body.code) ||
    pickString(body.roomCode) ||
    pickString(body.room_code);

  try {
    const member = await joinRoom(roomId, nickname, affiliation, pin);
    return NextResponse.json(
      { ok: true, memberId: member.id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "join_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
