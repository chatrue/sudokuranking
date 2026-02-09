import { supabaseServer } from "@/lib/supabaseServer";
import { kstDateString } from "@/lib/time";

export const runtime = "nodejs";

function toCSV(rows: any[]): string {
  const header = ["player_id","score","time_ms","difficulty","korea_date","created_at","country","lang"].join(",");
  const lines = rows.map(r => [
    r.player_id,
    r.score,
    r.time_ms,
    r.difficulty,
    r.korea_date,
    r.created_at,
    r.country ?? "",
    r.lang ?? "",
  ].map(v => {
    const s = String(v ?? "");
    // CSV escape
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
    return s;
  }).join(","));
  return [header, ...lines].join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "today") as "today" | "total";
  const format = (url.searchParams.get("format") ?? "csv") as "csv" | "json";
  const difficulty = url.searchParams.get("difficulty");

  const sb = supabaseServer;

  let q = sb
    .from("scores")
    .select("player_id, score, time_ms, difficulty, korea_date, created_at, country, lang")
    .order("score", { ascending: false })
    .order("time_ms", { ascending: true })
    .limit(1000);

  if (scope === "today") q = q.eq("korea_date", kstDateString(new Date()));
  if (difficulty && ["easy","medium","hard"].includes(difficulty)) q = q.eq("difficulty", difficulty);

  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

  const rows = data ?? [];
  if (format === "json") {
    return new Response(JSON.stringify({ ok: true, rows }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="sudoku_rankings_${scope}.json"`,
      },
    });
  }

  const csv = toCSV(rows);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sudoku_rankings_${scope}.csv"`,
    },
  });
}
