create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  front text not null,
  back text not null,
  category text,
  related_rules jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_cards_type on cards(type);
create index if not exists idx_cards_created_at on cards(created_at);

create table if not exists review_logs (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references cards(id) on delete cascade,
  quality int,
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  created_at timestamptz default now(),
  summary jsonb not null
);

create table if not exists session_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  card_id uuid references cards(id) on delete cascade,
  front text,
  back text,
  warmup int,
  recall int,
  final int
);
create index if not exists idx_session_cards_session on session_cards(session_id);
create index if not exists idx_session_cards_card on session_cards(card_id);

drop table if exists offsets;
create table offsets (
  type text primary key,
  offset_value int not null default 0
);

create table if not exists pomodoro_state (
  id int primary key default 1,
  remaining int not null default 7200,
  running boolean default false,
  updated_at timestamptz default now()
);
insert into pomodoro_state (id, remaining, running, updated_at)
values (1, 7200, false, now())
on conflict (id) do nothing;

drop table if exists public.memory_levels;

create table public.memory_levels (
  card_id uuid primary key references public.cards(id) on delete cascade,
  level   smallint not null check (level between 0 and 5),
  updated_at timestamptz not null default now()
);

create index if not exists memory_levels_updated_at_idx
  on public.memory_levels(updated_at desc);
