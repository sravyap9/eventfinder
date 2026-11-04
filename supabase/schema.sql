-- Sidequests: anonymous, opt in rating log. Run this once in the Supabase SQL editor.
--
-- The website uses Supabase's public "anon" key, which is visible in the page source by design.
-- So the rules below let that key INSERT rows and nothing else: it can never read, change or delete
-- anything. You read the data from the dashboard, or with the service key (keep that one secret).

create table if not exists public.sessions (
  id          uuid primary key,                       -- random, made in the browser; not linked to a person
  created_at  timestamptz not null default now(),
  answers     jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 4000),
  app_version text check (char_length(app_version) < 40)
);

create table if not exists public.ratings (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  event_url   text not null check (char_length(event_url) < 500 and event_url ~ '^https?://[^[:space:]]+$'),
  label       smallint not null check (label in (0, 1)),          -- 1 thumbs up, 0 thumbs down
  position    smallint check (position between 0 and 100),        -- where the pick was in the list
  predicted   real check (predicted between 0 and 1),             -- the model's match score at the time
  features    jsonb not null check (jsonb_typeof(features) = 'object' and pg_column_size(features) < 20000),  -- the exact inputs the model saw
  event       jsonb not null check (jsonb_typeof(event) = 'object' and pg_column_size(event) < 4000)         -- title, source, start, price: events.json is overwritten twice a day
);

create index if not exists ratings_session_idx on public.ratings (session_id);
create index if not exists ratings_created_idx on public.ratings (created_at);

-- Abuse limits. The public key cannot be kept secret, so anyone can call the API in a loop. These caps keep a script from
-- filling the free tier: a session can only rate so many events, and the whole table only accepts so many rows an hour.
-- (The functions run as their owner so they can count rows the public key is not allowed to read.)
create or replace function public.limit_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare per_hour constant int := 2000;
begin
  if (select count(*) from public.sessions where created_at > now() - interval '1 hour') >= per_hour then
    raise exception 'rate limit reached, try again later' using errcode = '54000';
  end if;
  return new;
end $$;

create or replace function public.limit_ratings() returns trigger
language plpgsql security definer set search_path = '' as $$
declare per_session constant int := 300; per_hour constant int := 5000;
begin
  if (select count(*) from public.ratings where session_id = new.session_id) >= per_session then
    raise exception 'too many ratings for this session' using errcode = '54000';
  end if;
  if (select count(*) from public.ratings where created_at > now() - interval '1 hour') >= per_hour then
    raise exception 'rate limit reached, try again later' using errcode = '54000';
  end if;
  return new;
end $$;

revoke all on function public.limit_sessions(), public.limit_ratings() from public, anon, authenticated;

drop trigger if exists sessions_limit on public.sessions;
create trigger sessions_limit before insert on public.sessions for each row execute function public.limit_sessions();
drop trigger if exists ratings_limit on public.ratings;
create trigger ratings_limit before insert on public.ratings for each row execute function public.limit_ratings();

-- Row level security: on, with insert only policies for the public key.
alter table public.sessions enable row level security;
alter table public.ratings  enable row level security;

revoke all on public.sessions, public.ratings from anon, authenticated;
grant insert on public.sessions, public.ratings to anon;

drop policy if exists "anon can add a session" on public.sessions;
create policy "anon can add a session" on public.sessions for insert to anon with check (true);

drop policy if exists "anon can add a rating" on public.ratings;
create policy "anon can add a rating" on public.ratings for insert to anon with check (true);

-- Handy for the dashboard (runs with the owner's rights, so it is not exposed to the public key).
create or replace view public.rating_summary with (security_invoker = on) as
select event->>'source'                       as source,
       count(*)                               as ratings,
       round(avg(label)::numeric, 3)          as like_rate,
       round(avg(predicted)::numeric, 3)      as avg_predicted
from public.ratings
group by 1
order by ratings desc;
revoke all on public.rating_summary from anon, authenticated;
