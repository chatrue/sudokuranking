import { NextResponse } from "next/server";
import { createRoom } from "./_store";

export const dynamic = "force-dynamic";

export async function POST() {
  const { room } = createRoom();
  return NextResponse.json({ ok: true, roomId: room.id, hostToken: room.hostToken, pin: room.pin });
}
