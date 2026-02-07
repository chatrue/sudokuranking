import { NextResponse } from "next/server";
import { getRoom, getPublicState } from "../_store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  const room = getRoom(roomId);
  if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, state: getPublicState(room) });
}
