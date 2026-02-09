import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  deviceId: string;
};

function kstDateStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const deviceId = String(body?.deviceId ?? "").trim();
    if (!deviceId) {
      return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const todayKst = kstDateStr();

    // 1) 전체 유니크 방문자 (deviceId 1회)
    await supabaseServer.from("visits_total").upsert(
      { device_id: deviceId },
      { onConflict: "device_id", ignoreDuplicates: true }
    );

    // 2) 오늘 유니크 방문자 (deviceId + kst_date 1회)
    await supabaseServer.from("visits_daily").upsert(
      { device_id: deviceId, kst_date: todayKst },
      { onConflict: "device_id,kst_date", ignoreDuplicates: true }
    );

    // 3) 카운트 조회
    const totalQ = await supabaseServer.from("visits_total").select("*", { count: "exact", head: true });
    const todayQ = await supabaseServer.from("visits_daily").select("*", { count: "exact", head: true }).eq("kst_date", todayKst);

    // 4) 내 누적 점수(서버 기준)
    const myScoreQ = await supabaseServer.from("scores").select("total_score").eq("user_key", deviceId).maybeSingle();

    const total = totalQ.count ?? 0;
    const today = todayQ.count ?? 0;
    const myScore = Number(myScoreQ.data?.total_score ?? 0) || 0;

    return Response.json({ ok: true, total, today, myScore });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? "unknown") }, { status: 500 });
  }
}
