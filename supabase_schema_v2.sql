-- Supabase SQL Editor에서 실행하세요.
-- 이 앱(sudoku-ranking-pwa)의 랭킹 집계(v2) 스키마/함수
-- - app/api/submit : submissions INSERT + RPC(submit_solo_result)
-- - app/api/rankings : 오늘(submissions 합산), 전체(scores)
-- - app/api/visitors : 오늘(submissions 고유 user_key), 전체(scores row count)

-- 1) 오늘 제출 로그 (중복 제출 방지: 같은 user_key가 같은 puzzle_id를 1회만 제출)
create table if not exists public.submissions (
  user_key text not null,
  puzzle_id text not null,
  user_id text not null,
  affiliation text not null,
  score integer not null,
  kst_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_key, puzzle_id)
);

create index if not exists submissions_kst_date_idx on public.submissions (kst_date);
create index if not exists submissions_user_key_idx on public.submissions (user_key);

-- 2) 누적 집계(전체 랭킹)
create table if not exists public.scores (
  user_key text primary key,
  user_id text not null,
  affiliation text not null,
  total_score integer not null default 0,
  games integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists scores_total_score_idx on public.scores (total_score desc);

-- 3) 누적 집계용 RPC
-- submit_solo_result(user_key) : scores를 UPSERT로 갱신
create or replace function public.submit_solo_result(
  p_user_key text,
  p_user_id text,
  p_affiliation text,
  p_score integer
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.scores (user_key, user_id, affiliation, total_score, games, updated_at)
  values (p_user_key, p_user_id, p_affiliation, p_score, 1, now())
  on conflict (user_key)
  do update set
    user_id = excluded.user_id,
    affiliation = excluded.affiliation,
    total_score = public.scores.total_score + excluded.total_score,
    games = public.scores.games + excluded.games,
    updated_at = now();
end;
$$;

-- 권한(선택): 서비스 롤이 아닌 키로 접근할 계획이 있으면 별도 정책/권한을 설계하세요.


-- 4) 유니크 방문자 집계 (deviceId 기준)
create table if not exists public.visits_total (
  device_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.visits_daily (
  device_id text not null,
  kst_date date not null,
  created_at timestamptz not null default now(),
  primary key (device_id, kst_date)
);

create index if not exists visits_daily_kst_date_idx on public.visits_daily (kst_date);
