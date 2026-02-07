import { supabaseServer } from "@/lib/supabaseServer";

function kstDateStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Today / Total 정의(합의):
 * - Today: 오늘 제출한 고유 user_key 수 (KST 기준)
 * - Total: 누적 고유 user_key 수 (scores 테이블에 있는 사용자 수)
 * - rooms(단체)는 submit 단계에서 이미 제외되므로 여기선 추가 분기 불필요
 */
export async function GET() {
  const today = kstDateStr();

  // Total = scores에 존재하는 고유 사용자 수
  const { count: totalCount, error: totalErr } = await supabaseServer
    .from("scores")
    .select("*", { count: "exact", head: true });

  if (totalErr) {
    return Response.json({ ok: false, error: totalErr.message }, { status: 500 });
  }

  // Today = submissions(kst_date=today)의 고유 user_key 수
  // (supabase-js로 distinct count가 제약이 있어, 데이터가 크지 않은 v1에선 group 방식 사용)
  const { data: todayRows, error: todayErr } = await supabaseServer
    .from("submissions")
    .select("user_key")
    .eq("kst_date", today);

  if (todayErr) {
    return Response.json({ ok: false, error: todayErr.message }, { status: 500 });
  }

  const set = new Set<string>();
  for (const r of todayRows ?? []) set.add(String((r as any).user_key));
  const todayCount = set.size;

  return Response.json({
    ok: true,
    today: todayCount,
    total: totalCount ?? 0,
    kstDate: today,
  });
}
