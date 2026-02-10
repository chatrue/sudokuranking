import { NextResponse } from "next/server";
import { startRoom, getPublicState } from "../../_store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const hostToken = String(body?.hostToken ?? "");

  try {
    const room = await startRoom(roomId, hostToken);
    if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    return NextResponse.json({ ok: true, state: getPublicState(room) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "start_failed" }, { status: 400 });
  }
}
