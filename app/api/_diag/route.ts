export const runtime = "nodejs";

function safe(v?: string) {
  if (!v) return null;
  return v.length <= 12 ? v : `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // 1) env 로딩 여부
  const env = {
    hasUrl: Boolean(url),
    hasServiceRole: Boolean(key),
    urlPreview: url ? safe(url) : null,
    keyPreview: key ? safe(key) : null,
  };

  // env 자체가 없으면 여기서 끝
  if (!url || !key) {
    return Response.json({ ok: false, step: "env", env, error: "missing_env" }, { status: 500 });
  }

  // 2) 네트워크 fetch 테스트 (Supabase health endpoint)
  // Supabase는 auth health 경로가 비교적 안정적
  const healthUrl = `${url.replace(/\/+$/, "")}/auth/v1/health`;

  try {
    const res = await fetch(healthUrl, { cache: "no-store" });
    const text = await res.text();
    return Response.json({
      ok: res.ok,
      step: "fetch",
      env,
      healthUrl,
      status: res.status,
      bodyPreview: text.slice(0, 200),
    });
  } catch (e: any) {
    // fetch failed의 “진짜 이유”가 여기로 들어옴
    return Response.json(
      {
        ok: false,
        step: "fetch",
        env,
        healthUrl,
        error: String(e?.message ?? e),
        cause: e?.cause ? String(e.cause) : null,
      },
      { status: 500 }
    );
  }
}
