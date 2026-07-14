-- ============================================================================
-- KEBOEN ARSENA — SUPABASE SCHEMA
-- Jalankan seluruh file ini di: Supabase Dashboard -> SQL Editor -> New Query
-- Aman dijalankan berulang kali (idempotent) karena memakai IF NOT EXISTS /
-- DROP POLICY IF EXISTS sebelum membuat ulang.
-- ============================================================================

-- Pastikan ekstensi yang dibutuhkan aktif (biasanya sudah aktif di Supabase)
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TABLE: batches  (Batch Tanam — semai -> rakit apung -> panen)
-- ============================================================================
create table if not exists public.batches (
  id                  bigserial primary key,
  user_id             uuid not null references auth.users(id) on delete cascade default auth.uid(),
  batch_no            int not null,
  "dateSemai"         date not null,
  qty                 int not null check (qty > 0),
  note                text,
  "datePindah"        date,
  "datePanen"         date,
  "qtyRakit"          int check ("qtyRakit" >= 0),
  "pindahNote"        text,
  "estKg"             numeric(10,2) check ("estKg" >= 0),
  status              text not null default 'semai' check (status in ('semai','rakit','panen')),
  "actualKg"          numeric(10,2) check ("actualKg" >= 0),
  "harvestNote"       text,
  "actualHarvestDate" date,
  "createdAt"         timestamptz not null default now(),
  constraint batches_user_batchno_unique unique (user_id, batch_no)
);

create index if not exists idx_batches_user_id      on public.batches (user_id);
create index if not exists idx_batches_status       on public.batches (status);
create index if not exists idx_batches_date_semai   on public.batches ("dateSemai");
create index if not exists idx_batches_date_panen   on public.batches ("datePanen");

-- ============================================================================
-- 2. TABLE: rencana  (Rencana / Anggaran Bulanan)
--    Dibuat sebelum "expenses" karena expenses."rencanaId" mereferensikan
--    tabel ini lewat foreign key.
-- ============================================================================
create table if not exists public.rencana (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  month       text not null check (month ~ '^\d{4}-\d{2}$'), -- format YYYY-MM
  cat         text not null,
  desc        text,
  amount      numeric(12,2) not null check (amount > 0),
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_rencana_user_id      on public.rencana (user_id);
create index if not exists idx_rencana_month        on public.rencana (month);

-- ============================================================================
-- 3. TABLE: expenses  (Pengeluaran)
-- ============================================================================
create table if not exists public.expenses (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date        date not null,
  cat         text not null,
  desc        text,
  amount      numeric(12,2) not null check (amount > 0),
  "rencanaId" bigint references public.rencana(id) on delete set null,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_expenses_user_id    on public.expenses (user_id);
create index if not exists idx_expenses_date        on public.expenses (date);
create index if not exists idx_expenses_cat          on public.expenses (cat);
create index if not exists idx_expenses_rencana_id  on public.expenses ("rencanaId");

-- ============================================================================
-- 4. TABLE: sales  (Penjualan)
-- ============================================================================
create table if not exists public.sales (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  invoice     text,
  date        date not null,
  buyer       text not null,
  qty         numeric(10,2) not null check (qty > 0),
  price       numeric(12,2) not null check (price > 0),
  total       numeric(14,2) not null check (total >= 0),
  pay         text not null check (pay in ('tunai','transfer','tempo')),
  due         date,
  note        text,
  status      text not null default 'lunas'
              check (status in ('lunas','pending-approval','tempo-aktif','ditolak')),
  "paidDate"  date,
  "createdAt" timestamptz not null default now(),
  constraint sales_invoice_user_unique unique (user_id, invoice)
);

create index if not exists idx_sales_user_id  on public.sales (user_id);
create index if not exists idx_sales_status   on public.sales (status);
create index if not exists idx_sales_date     on public.sales (date);
create index if not exists idx_sales_due      on public.sales (due);

-- ============================================================================
-- 5. TABLE: saldo  (Saldo Awal — satu baris per user, "settings" style)
-- ============================================================================
create table if not exists public.saldo (
  user_id     uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  amount      numeric(14,2) not null default 0,
  note        text,
  "updatedAt" date not null default current_date
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.batches  enable row level security;
alter table public.expenses enable row level security;
alter table public.rencana  enable row level security;
alter table public.sales    enable row level security;
alter table public.saldo    enable row level security;

-- BATCHES policies
drop policy if exists "batches_select_own" on public.batches;
create policy "batches_select_own" on public.batches
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "batches_insert_own" on public.batches;
create policy "batches_insert_own" on public.batches
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "batches_update_own" on public.batches;
create policy "batches_update_own" on public.batches
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "batches_delete_own" on public.batches;
create policy "batches_delete_own" on public.batches
  for delete to authenticated using (user_id = auth.uid());

-- EXPENSES policies
drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own" on public.expenses
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own" on public.expenses
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own" on public.expenses
  for delete to authenticated using (user_id = auth.uid());

-- RENCANA policies
drop policy if exists "rencana_select_own" on public.rencana;
create policy "rencana_select_own" on public.rencana
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "rencana_insert_own" on public.rencana;
create policy "rencana_insert_own" on public.rencana
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "rencana_update_own" on public.rencana;
create policy "rencana_update_own" on public.rencana
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "rencana_delete_own" on public.rencana;
create policy "rencana_delete_own" on public.rencana
  for delete to authenticated using (user_id = auth.uid());

-- SALES policies
drop policy if exists "sales_select_own" on public.sales;
create policy "sales_select_own" on public.sales
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "sales_insert_own" on public.sales;
create policy "sales_insert_own" on public.sales
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "sales_update_own" on public.sales;
create policy "sales_update_own" on public.sales
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "sales_delete_own" on public.sales;
create policy "sales_delete_own" on public.sales
  for delete to authenticated using (user_id = auth.uid());

-- SALDO policies
drop policy if exists "saldo_select_own" on public.saldo;
create policy "saldo_select_own" on public.saldo
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "saldo_insert_own" on public.saldo;
create policy "saldo_insert_own" on public.saldo
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "saldo_update_own" on public.saldo;
create policy "saldo_update_own" on public.saldo
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "saldo_delete_own" on public.saldo;
create policy "saldo_delete_own" on public.saldo
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================================
-- REALTIME
-- Aktifkan replikasi realtime untuk tabel-tabel yang perlu live update.
-- (Aman dijalankan berulang; akan error "already member" jika sudah pernah
--  ditambahkan — abaikan error tersebut jika muncul.)
-- ============================================================================
alter publication supabase_realtime add table public.batches;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.rencana;
alter publication supabase_realtime add table public.saldo;

-- ============================================================================
-- SELESAI. Jalankan seluruh isi file ini sekaligus di Supabase SQL Editor.
-- ============================================================================
