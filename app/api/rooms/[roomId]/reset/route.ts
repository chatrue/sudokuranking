// app/api/rooms/[roomId]/reset/route.ts
import { getRoom, resetRoom, saveRoom } from "../../_store";

export async function POST(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;

  const room = await getRoom(roomId);
  if (!room) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // NOTE: local prototype - no auth, but we only expose this in host UI.
  resetRoom(room);
    await saveRoom(room);
  return Response.json({ ok: true, room });
}
