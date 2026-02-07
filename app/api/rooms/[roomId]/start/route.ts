import { NextResponse } from "next/server";
import { getRoom, requireHost, startRoom, getPublicState } from "../../_store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const room = getRoom(roomId);
  if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const hostToken = String(body?.hostToken ?? "");

  try {
    requireHost(room, hostToken);
    startRoom(room);
    return NextResponse.json({ ok: true, state: getPublicState(room) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "start_failed" }, { status: 400 });
  }
}
