-- JP Personalized Learning - Clean Schema V1
-- Generated: 2025-10-12T14:21:22

-- ===== Extensions =====
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ===== Helpers =====
-- Chuẩn hoá text để tạo unique theo front/back đã khử dấu + lowercase
drop function if exists public.norm_text(text);
create or replace function public.norm_text(t text)
returns text
language sql
immutable
as $fn$
  select regexp_replace(
           lower(
             translate(
               trim(coalesce(t,'')),
               'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ' ||
               'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ' ||
               'çÇñÑäÄëËïÏöÖüÜåÅøØæÆ',
               'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiioooooooooooooooouuuuuuuuuuyyyyyd' ||
               'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUYYYYYĐ' ||
               'cCnNaAeEiIoOuUaAoOaeAE'
             )
           ),
           '\s+',' ','g'
         )
$fn$;

-- ===== Core tables =====
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  type text not null,           -- ví dụ: 'vocab' | 'kanji' | 'grammar' | 'particle'
  front text not null,
  back  text not null,
  category text,
  related_rules jsonb,
  created_at timestamptz default now(),
  deleted boolean default false,
  deleted_at timestamptz
);
create index if not exists idx_cards_type on public.cards(type);
create index if not exists idx_cards_created_at on public.cards(created_at);
create unique index if not exists uniq_cards_triplet_norm
  on public.cards(type, public.norm_text(front), public.norm_text(back))
  where deleted = false;

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.cards(id) on delete cascade,
  quality int check (quality between 0 and 5),   -- 0..5
  meta jsonb,
  created_at timestamptz default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  created_at timestamptz default now(),
  summary jsonb not null,
  deleted boolean default false,
  deleted_at timestamptz
);

create table if not exists public.session_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  front text,
  back  text,
  warmup int,         -- 0..5 (tuỳ dùng)
  recall int,         -- 0..5 (tuỳ dùng)
  final int,          -- 0..5 (điểm cuối)
  created_at timestamptz default now()
);
create index if not exists idx_session_cards_session on public.session_cards(session_id);
create index if not exists idx_session_cards_card on public.session_cards(card_id);

create table if not exists public.offsets (
  type text primary key,
  offset_value int not null default 0
);

-- ===== User settings (tuỳ chọn, không cần login) =====
create table if not exists public.user_settings (
  id           int primary key default 1,
  updated_at   timestamptz not null default now(),
  selected_decks    text[]      default null,
  recency_cutoff    interval    default null,
  cards_per_session int         default 10 check (cards_per_session between 5 and 100),
  review_mode       text        default 'fsrs',        -- fsrs | leitner | cram
  auto_flip_sec     int         default 0,
  font_px           int         default 24,
  card_orientation  text        default 'normal',
  flip_stabilize    boolean     default true
);
create or replace function public.set_user_settings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists tg_user_settings_u on public.user_settings;
create trigger tg_user_settings_u
before insert or update on public.user_settings
for each row execute function public.set_user_settings_updated_at();
insert into public.user_settings (id) values (1) on conflict (id) do nothing;

-- (tuỳ mô hình bảo mật) nếu cần đọc qua anon key:
grant select, update on public.user_settings to anon;

-- ===== Memory levels (phục vụ Progress/Leech/Unique) =====
create table if not exists public.memory_levels (
  card_id uuid primary key references public.cards(id) on delete cascade,
  type text,                                -- KHÔNG đặt NOT NULL để an toàn
  level smallint not null default 0 check (level between 0 and 5),
  stability float default 0,
  difficulty float default 5,
  due timestamptz,
  last_reviewed_at timestamptz,
  last_learned_at timestamptz default now(),
  leech_count int default 0,
  is_leech boolean default false,
  updated_at timestamptz not null default now()
);
create index if not exists idx_memory_levels_type_level on public.memory_levels(type, level);
create index if not exists idx_memory_levels_reviewed on public.memory_levels(last_reviewed_at);
create index if not exists idx_memory_levels_updated_at on public.memory_levels(updated_at desc);

-- Trigger: tự cập nhật timestamps khi insert/update
create or replace function public.touch_memory_levels()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if (tg_op = 'INSERT') then
    if new.last_reviewed_at is null then new.last_reviewed_at := now(); end if;
  elsif (tg_op = 'UPDATE') then
    if (new.level is distinct from old.level) then new.last_reviewed_at := now(); end if;
  end if;
  return new;
end$$;
drop trigger if exists trg_touch_memory_levels on public.memory_levels;
create trigger trg_touch_memory_levels
before insert or update on public.memory_levels
for each row execute function public.touch_memory_levels();

-- View: bảng Leech top
drop view if exists public.v_leech_top;
create or replace view public.v_leech_top as
select
  ml.card_id,
  coalesce(ml.type, c.type) as type,
  ml.leech_count,
  ml.is_leech,
  c.front,
  c.back,
  c.category
from public.memory_levels ml
join public.cards c on c.id = ml.card_id
where c.deleted = false and ml.is_leech = true
order by ml.leech_count desc, ml.last_reviewed_at desc
limit 100;

-- ===== Pomodoro (định nghĩa duy nhất) =====
create table if not exists public.pomodoro_state (
  id int primary key default 1,
  phase_index int not null default 0,
  sec_left int not null default 1500,
  paused boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.pomodoro_state (id) values (1) on conflict (id) do nothing;

-- Bật RLS + policy chỉ-đọc cho anon (API service role vẫn ghi bình thường)
alter table public.pomodoro_state enable row level security;
drop policy if exists "pomo select all" on public.pomodoro_state;
create policy "pomo select all"
on public.pomodoro_state
for select
to anon
using (true);

-- Bật realtime (idempotent)
do $$
begin
  perform 1
  from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='pomodoro_state';
  if not found then
    execute 'alter publication supabase_realtime add table public.pomodoro_state';
  end if;
end $$;

-- ====== Logic cập nhật memory từ review ======
-- Bảo đảm tồn tại hàng memory (khi thêm session_card)
create or replace function public.ensure_memory_level_exists()
returns trigger language plpgsql as $$
declare
  card_type text;
begin
  if not exists (select 1 from public.memory_levels where card_id = new.card_id) then
    select c.type into card_type from public.cards c where c.id = new.card_id;
    insert into public.memory_levels(card_id, type, level, last_learned_at)
    values (new.card_id, card_type, 0, now());
  end if;
  return new;
end$$;
drop trigger if exists trg_session_cards_insert on public.session_cards;
create trigger trg_session_cards_insert
after insert on public.session_cards
for each row execute function public.ensure_memory_level_exists();

-- Hàm cập nhật level/stability/leech theo quality (0..5)
create or replace function public.update_memory_after_review(p_card_id uuid, p_quality int)
returns void language plpgsql as $$
declare
  card_type text;
  prior_leech int;
  inc_leech int;
begin
  select c.type into card_type from public.cards c where c.id = p_card_id;
  if card_type is null then card_type := 'vocab'; end if;

  select coalesce(leech_count,0) into prior_leech
  from public.memory_levels where card_id = p_card_id;

  inc_leech := case when p_quality <= 1 then 1 else 0 end;

  if found then
    update public.memory_levels
    set
      type = coalesce(type, card_type),
      level = greatest(0, least(5, level + case when p_quality >= 4 then 1 when p_quality = 3 then 0 else -1 end)),
      stability = case
                    when p_quality >= 4 then coalesce(stability,0) + 1.0
                    when p_quality = 3 then coalesce(stability,0)
                    else greatest(0, coalesce(stability,0) * 0.7)
                  end,
      difficulty = case when p_quality <= 1 then coalesce(difficulty,5) + 0.5 else greatest(1, coalesce(difficulty,5) - 0.1) end,
      leech_count = prior_leech + inc_leech,
      is_leech = (prior_leech + inc_leech) >= 3,
      last_reviewed_at = now(),
      updated_at = now()
    where card_id = p_card_id;
  else
    insert into public.memory_levels(card_id, type, level, stability, difficulty, leech_count, is_leech, last_reviewed_at, updated_at)
    values (
      p_card_id, card_type,
      case when p_quality >= 4 then 1 else 0 end,
      case when p_quality >= 4 then 1 else 0 end,
      5,
      inc_leech,
      inc_leech >= 3,
      now(),
      now()
    );
  end if;
end$$;

-- Tự động cập nhật khi ghi log review hoặc khi sửa final của session_cards
create or replace function public.trg_on_review_insert()
returns trigger language plpgsql as $$
begin
  perform public.update_memory_after_review(new.card_id, new.quality);
  return new;
end$$;
drop trigger if exists trg_review_logs_insert on public.review_logs;
create trigger trg_review_logs_insert
after insert on public.review_logs
for each row execute function public.trg_on_review_insert();

create or replace function public.trg_session_cards_update()
returns trigger language plpgsql as $$
begin
  if new.final is not null and (old.final is distinct from new.final) then
    perform public.update_memory_after_review(new.card_id, new.final);
  end if;
  return new;
end$$;
drop trigger if exists trg_session_cards_after_update on public.session_cards;
create trigger trg_session_cards_after_update
after update on public.session_cards
for each row
when (old.final is distinct from new.final)
execute function public.trg_session_cards_update();

-- Bắt PostgREST reload schema (Supabase)
select pg_notify('pgrst', 'reload schema');

BEGIN;

-- 1) Gỡ view đang tham chiếu category (nếu có)
DROP VIEW IF EXISTS public.v_leech_top CASCADE;

-- 2) Xoá cột category/categories khỏi bảng cards
ALTER TABLE public.cards DROP COLUMN IF EXISTS category CASCADE;
-- (nếu trước đó bạn từng đặt tên 'categories')
ALTER TABLE public.cards DROP COLUMN IF EXISTS categories CASCADE;

-- 3) Tạo lại view leech (không còn cột category)
CREATE OR REPLACE VIEW public.v_leech_top AS
SELECT
  ml.card_id,
  COALESCE(ml.type, c.type) AS type,
  ml.leech_count,
  ml.is_leech,
  c.front,
  c.back
FROM public.memory_levels ml
JOIN public.cards c ON c.id = ml.card_id
WHERE c.deleted = false
  AND ml.is_leech = true
ORDER BY ml.leech_count DESC, ml.last_reviewed_at DESC
LIMIT 100;

-- 4) Yêu cầu PostgREST/Supabase reload schema
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
