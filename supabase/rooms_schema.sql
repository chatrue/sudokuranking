-- rooms schema for group play ("함께 즐기기")
-- This stores the whole room state as JSON so it works reliably on Vercel/serverless.

create table if not exists public.room_states (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Optional: index for updated_at cleanup jobs
create index if not exists room_states_updated_at_idx on public.room_states(updated_at);
