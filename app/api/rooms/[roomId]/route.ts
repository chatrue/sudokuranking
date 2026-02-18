import { NextResponse } from "next/server";
import { getRoom, getPublicState } from "../_store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  try {
    const room = await getRoom(roomId);
    if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    return NextResponse.json(
      { ok: true, state: getPublicState(room) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    // ✅ 여기서 실제 원인을 로그로 남겨야 Vercel/터미널에서 바로 확인 가능
    console.error("[GET /api/rooms/:roomId] failed:", e);

    return NextResponse.json(
      { ok: false, error: e?.message ?? "server_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
