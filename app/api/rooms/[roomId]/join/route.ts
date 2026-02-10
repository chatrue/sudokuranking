import { NextResponse } from "next/server";
import { joinRoom } from "../../_store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const nickname = String(body?.nickname ?? "");
  const affiliation = String(body?.affiliation ?? "");
  const pin = String(body?.pin ?? "");

  try {
    const member = await joinRoom(roomId, nickname, affiliation, pin);
    return NextResponse.json({ ok: true, memberId: member.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "join_failed" }, { status: 400 });
  }
}
