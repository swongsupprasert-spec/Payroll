-- ============================================================
--  Payroll — Supabase schema
--  วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางทั้งไฟล์นี้ → Run
--  โปรเจกต์: https://sfzzswzyoqshlppsturd.supabase.co
-- ============================================================

-- เก็บข้อมูลทั้งหมดของผู้ใช้แต่ละคนไว้เป็น JSON ก้อนเดียว (1 แถว/ผู้ใช้)
-- แนวนี้ทำให้แอปเดิม (ที่ serialize DB เป็นออบเจ็กต์เดียว) ย้ายขึ้นคลาวด์ได้โดยแก้โค้ดน้อยที่สุด
create table if not exists public.payroll_stores (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- เปิด Row-Level Security: ผู้ใช้เห็น/แก้ได้เฉพาะข้อมูลของตนเอง
alter table public.payroll_stores enable row level security;

drop policy if exists "read own"   on public.payroll_stores;
drop policy if exists "insert own" on public.payroll_stores;
drop policy if exists "update own" on public.payroll_stores;

create policy "read own"   on public.payroll_stores
  for select using (auth.uid() = user_id);
create policy "insert own" on public.payroll_stores
  for insert with check (auth.uid() = user_id);
create policy "update own" on public.payroll_stores
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- อัปเดต updated_at อัตโนมัติทุกครั้งที่บันทึก
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch on public.payroll_stores;
create trigger trg_touch before update on public.payroll_stores
  for each row execute function public.touch_updated_at();
