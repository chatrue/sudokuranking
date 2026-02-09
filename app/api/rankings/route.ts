import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  // ✅ 누적(전체) 점수 기준 Top1만 반환
  const { data, error } = await supabaseServer
    .from("scores")
    .select("user_id, affiliation, total_score, updated_at")
    .order("total_score", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(1);

  if (error) return Response.json({ rows: [], error: error.message }, { status: 500 });

  const top = (data ?? [])[0];
  if (!top) return Response.json({ rows: [] });

  // ✅ 랭킹 화면 정책: 1등의 아이디 + 국가/소속만
  return Response.json({
    rows: [
      {
        rank: 1,
        player_id: top.user_id,
        country: top.affiliation,
      },
    ],
  });
}
