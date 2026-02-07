-- Supabase SQL Editor에서 실행하세요.
-- 테이블: scores

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  korea_date date not null,
  player_id text not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  time_ms integer not null,
  score integer not null,
  country text,
  lang text,
  puzzle_id text
);

create index if not exists scores_korea_date_idx on public.scores (korea_date);
create index if not exists scores_score_idx on public.scores (score desc, time_ms asc);

-- RLS는 서버리스(API)에서 service_role 키로 접근하므로 필수는 아니지만,
-- 나중에 클라이언트 직접 접근을 허용할 가능성이 있다면 아래처럼 켜두는 게 안전합니다.

alter table public.scores enable row level security;

-- 기본: 클라이언트(anon)에서 직접 읽기/쓰기 금지 (정책 없음 -> 차단)
-- 지금 구조는 Next.js API에서만 접근하므로 OK.
