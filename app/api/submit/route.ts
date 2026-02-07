import { supabaseServer } from "@/lib/supabaseServer";

type Body = {
  deviceId: string;
  playerId: string;
  country: string; // 나라/소속(affiliation)
  score: number;
  puzzleId: string;
  mode?: "solo" | "group";
};

function kstDateStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

// Postgres unique_violation
const UNIQUE_VIOLATION = "23505";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const deviceId = String(body?.deviceId ?? "").trim();
    const playerId = String(body?.playerId ?? "").trim();
    const country = String(body?.country ?? "").trim();
    const score = Math.floor(Number(body?.score ?? 0));
    const puzzleId = String(body?.puzzleId ?? "").trim();
    const mode = body?.mode ?? "solo";

    if (!deviceId || !playerId || !country || !Number.isFinite(score) || !puzzleId) {
      return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    // ✅ 단체(rooms)는 집계 제외
    if (mode !== "solo") {
      return Response.json({ ok: true, skipped: "group_mode" });
    }

    const user_key = deviceId;
    const todayKst = kstDateStr(); // "YYYY-MM-DD"

    // ✅ 1) 중복 제출 방지 + 오늘 점수/날짜 기록
    // primary key (user_key, puzzle_id)라서 같은 퍼즐은 1회만 통과
    const { error: insErr } = await supabaseServer.from("submissions").insert({
      user_key,
      puzzle_id: puzzleId,
      user_id: playerId,
      affiliation: country,
      score,
      kst_date: todayKst,
      created_at: new Date().toISOString(),
    });

    if (insErr) {
      const anyErr = insErr as any;

      // ✅ 진짜 "중복 제출"만 스킵 처리
      if (anyErr?.code === UNIQUE_VIOLATION) {
        return Response.json({ ok: true, skipped: "duplicate_puzzle" });
      }

      // ❗그 외는 실제 서버/DB 오류 -> 숨기지 말고 알려야 원인 파악 가능
      return Response.json(
        {
          ok: false,
          error: "insert_failed",
          detail: anyErr?.message ?? String(insErr),
          code: anyErr?.code ?? null,
          hint: anyErr?.hint ?? null,
        },
        { status: 500 }
      );
    }

    // ✅ 2) 누적 점수/방문자 집계 (RPC)
    const { error: rpcErr } = await supabaseServer.rpc("submit_solo_result", {
      p_user_key: user_key,
      p_user_id: playerId,
      p_affiliation: country,
      p_score: score,
    });

    if (rpcErr) {
      const anyErr = rpcErr as any;
      return Response.json(
        {
          ok: false,
          error: "rpc_failed",
          detail: anyErr?.message ?? String(rpcErr),
          code: anyErr?.code ?? null,
          hint: anyErr?.hint ?? null,
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? "unknown") }, { status: 500 });
  }
}