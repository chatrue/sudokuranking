import { NextResponse } from "next/server";
import { submitResult, getPublicState } from "../../_store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const memberId = String(body?.memberId ?? "");
  const score = Number(body?.score ?? 0);
  const timeMs = Number(body?.timeMs ?? 0);

  try {
    const room = await submitResult(roomId, memberId, score, timeMs);
    if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    return NextResponse.json({ ok: true, state: getPublicState(room) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "submit_failed" }, { status: 400 });
  }
}
