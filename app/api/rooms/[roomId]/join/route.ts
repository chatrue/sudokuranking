import { NextResponse } from "next/server";
import { getRoom, joinRoom, saveRoom } from "../../_store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const nickname = String(body?.nickname ?? "");
  const affiliation = String(body?.affiliation ?? "");
  const pin = String(body?.pin ?? "");

  try {
    const member = joinRoom(room, nickname, affiliation, pin);
    await saveRoom(room);
    return NextResponse.json({ ok: true, memberId: member.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "join_failed" }, { status: 400 });
  }
}
