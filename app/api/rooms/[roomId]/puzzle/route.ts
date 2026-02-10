import { NextResponse } from "next/server";
import { getRoom } from "../../_store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!room.puzzleData) return NextResponse.json({ ok: false, error: "no_puzzle" }, { status: 400 });

  return NextResponse.json({ ok: true, puzzle: room.puzzleData }, { headers: { "Cache-Control": "no-store" } });
}
