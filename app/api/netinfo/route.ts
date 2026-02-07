import { NextResponse } from "next/server";
import os from "os";

export const dynamic = "force-dynamic";

function pickLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  const candidates: string[] = [];
  for (const name of Object.keys(ifaces)) {
    const list = ifaces[name] || [];
    for (const info of list) {
      if (!info) continue;
      // @ts-ignore
      if (info.family !== "IPv4") continue;
      // @ts-ignore
      if (info.internal) continue;
      // @ts-ignore
      const addr = info.address as string;
      if (!addr) continue;
      // Prefer private ranges
      if (addr.startsWith("192.168.") || addr.startsWith("10.") || addr.startsWith("172.")) {
        candidates.unshift(addr);
      } else {
        candidates.push(addr);
      }
    }
  }
  return candidates[0] || null;
}

export async function GET() {
  const ip = pickLanIp();
  return NextResponse.json({ ok: true, ip });
}
