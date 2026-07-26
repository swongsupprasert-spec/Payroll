-- ============================================================
--  Payroll — Admin & Profiles (รันเพิ่มเติมใน SQL Editor)
--  ให้แอดมินเห็นอีเมลผู้ใช้ทั้งหมด และเข้าดู/แก้ข้อมูลของแต่ละคนได้
-- ============================================================

-- 1) profiles: เก็บอีเมลของผู้ใช้ (ให้แอดมินเห็นรายชื่อ)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 2) app_admins: รายชื่อ user ที่เป็นแอดมิน
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;

-- 3) ฟังก์ชันเช็คว่าเป็นแอดมินไหม (security definer = ข้าม RLS กันวนซ้ำ)
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(select 1 from public.app_admins where user_id = auth.uid());
$$;

-- 4) Policies: profiles
drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profile insert own" on public.profiles;
create policy "profile insert own" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profile update own" on public.profiles;
create policy "profile update own" on public.profiles
  for update using (auth.uid() = id);

-- 5) Policies: app_admins (อ่านได้เฉพาะแอดมิน)
drop policy if exists "admins read" on public.app_admins;
create policy "admins read" on public.app_admins
  for select using (public.is_admin());

-- 6) payroll_stores: ให้แอดมินอ่าน/แก้ของทุกคนได้ (เดิมเห็นเฉพาะของตัวเอง)
drop policy if exists "read own"   on public.payroll_stores;
drop policy if exists "update own" on public.payroll_stores;
create policy "read own or admin" on public.payroll_stores
  for select using (auth.uid() = user_id or public.is_admin());
create policy "update own or admin" on public.payroll_stores
  for update using (auth.uid() = user_id or public.is_admin())
              with check (auth.uid() = user_id or public.is_admin());

-- 7) Trigger: สร้าง profile อัตโนมัติเมื่อมีผู้สมัครใหม่
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles(id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8) Backfill: สร้าง profile ให้ผู้ใช้ที่สมัครไปแล้ว
insert into public.profiles(id, email)
  select id, email from auth.users on conflict (id) do nothing;

-- ============================================================
-- 9) ⬇️ ตั้งให้อีเมลของคุณเป็นแอดมิน — แก้อีเมลด้านล่างเป็นของคุณ
-- ============================================================
insert into public.app_admins(user_id)
  select id from auth.users where email = 'ADMIN_EMAIL_HERE'
  on conflict (user_id) do nothing;
