import { NextResponse } from "next/server";
import { resetRoom, getPublicState } from "../../_store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  const body = await req.json().catch(() => ({}));

  // ✅ 방장 토큰 필수 (없으면 즉시 차단)
  const hostToken = String((body as any)?.hostToken ?? "");
  if (!hostToken) {
    return NextResponse.json({ ok: false, error: "host_only" }, { status: 400 });
  }

  try {
    const room = await resetRoom(roomId, hostToken);
    if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    return NextResponse.json(
      { ok: true, state: getPublicState(room) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "reset_failed" }, { status: 400 });
  }
}
