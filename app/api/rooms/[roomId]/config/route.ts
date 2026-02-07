import { NextResponse } from "next/server";
import { getRoom, requireHost, updateConfig } from "../../_store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  const room = getRoom(roomId);
  if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const hostToken = String(body?.hostToken ?? "");

  try {
    requireHost(room, hostToken);

    const patch: any = {};
    if (body?.difficulty) patch.difficulty = body.difficulty;
    if (typeof body?.highlightSameNumbers === "boolean") patch.highlightSameNumbers = body.highlightSameNumbers;
    if (typeof body?.showCompletedNumbers === "boolean") patch.showCompletedNumbers = body.showCompletedNumbers;

    updateConfig(room, patch);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "config_failed" }, { status: 400 });
  }
}
