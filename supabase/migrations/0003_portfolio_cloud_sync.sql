-- =============================================================================
-- BORNERS GROUP — МИГРАЦИЯ 0003: ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ ПОРТФЕЛЯ И ФОТОГАЛЕРЕЙ
-- Работает на бесплатном тарифе Supabase Free (500 МБ БД / 1 ГБ Storage)
-- =============================================================================

create table if not exists public.borners_portfolio_kv (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_borners_portfolio_kv_updated_at
  on public.borners_portfolio_kv (updated_at desc);

alter table public.borners_portfolio_kv enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.borners_portfolio_kv to anon, authenticated;

drop policy if exists "borners_portfolio_kv_select" on public.borners_portfolio_kv;
create policy "borners_portfolio_kv_select"
  on public.borners_portfolio_kv
  for select
  to anon, authenticated
  using (true);

drop policy if exists "borners_portfolio_kv_insert" on public.borners_portfolio_kv;
create policy "borners_portfolio_kv_insert"
  on public.borners_portfolio_kv
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "borners_portfolio_kv_update" on public.borners_portfolio_kv;
create policy "borners_portfolio_kv_update"
  on public.borners_portfolio_kv
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "borners_portfolio_kv_delete" on public.borners_portfolio_kv;
create policy "borners_portfolio_kv_delete"
  on public.borners_portfolio_kv
  for delete
  to anon, authenticated
  using (true);
