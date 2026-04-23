-- Finance Calendar app tables + profile linked to Supabase Auth.
-- Run in Supabase SQL Editor, or via `supabase db push` if you use the Supabase CLI.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profile row per auth user (id = auth.users.id)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  current_balance_usd double precision not null default 0,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- App data (snake_case columns; Express maps to API DTOs)
-- ---------------------------------------------------------------------------
create table if not exists public.user_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null,
  name text not null,
  color_index integer not null default 0,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  monthly_amount_usd double precision not null,
  unique (user_id, category)
);

create table if not exists public.month_category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  year_month text not null,
  category_slug text not null,
  monthly_amount_usd double precision not null,
  unique (user_id, year_month, category_slug)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  category text not null,
  estimated_cost_usd double precision,
  recurrence text,
  recurrence_end timestamptz,
  expense_kind text,
  created_at timestamptz not null default now()
);

create table if not exists public.tracked_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  occurrence_key text not null default '',
  amount_usd double precision not null,
  category text not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id, occurrence_key)
);

create index if not exists tracked_expenses_user_created_idx
  on public.tracked_expenses (user_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS + grants for anon key + user JWT access (no service_role required).
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_categories to authenticated;
grant select, insert, update, delete on table public.category_budgets to authenticated;
grant select, insert, update, delete on table public.month_category_budgets to authenticated;
grant select, insert, update, delete on table public.events to authenticated;
grant select, insert, update, delete on table public.tracked_expenses to authenticated;

alter table public.profiles enable row level security;
alter table public.user_categories enable row level security;
alter table public.category_budgets enable row level security;
alter table public.month_category_budgets enable row level security;
alter table public.events enable row level security;
alter table public.tracked_expenses enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists user_categories_all_own on public.user_categories;
create policy user_categories_all_own on public.user_categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists category_budgets_all_own on public.category_budgets;
create policy category_budgets_all_own on public.category_budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists month_category_budgets_all_own on public.month_category_budgets;
create policy month_category_budgets_all_own on public.month_category_budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists events_all_own on public.events;
create policy events_all_own on public.events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists tracked_expenses_all_own on public.tracked_expenses;
create policy tracked_expenses_all_own on public.tracked_expenses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
