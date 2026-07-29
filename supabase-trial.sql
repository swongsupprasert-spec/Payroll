-- ============================================================
--  ระบบทดลองใช้ฟรี 30 วัน + แพ็กเกจแบบเสียเงิน
--  บังคับสิทธิ์ที่ระดับฐานข้อมูล (RLS) — เลี่ยงผ่านหน้าเว็บไม่ได้
-- ============================================================

-- 1) เพิ่มคอลัมน์สิทธิ์ในตาราง profiles
alter table public.profiles add column if not exists paid_until timestamptz;
alter table public.profiles add column if not exists plan       text;
alter table public.profiles add column if not exists trial_days int not null default 30;

-- 2) ฟังก์ชันเช็คสิทธิ์เข้าใช้งาน (ทดลองยังไม่หมด หรือ จ่ายแล้วยังไม่หมดอายุ หรือ เป็นแอดมิน)
create or replace function public.has_access(uid uuid default auth.uid())
returns boolean language sql security definer stable
set search_path = public as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = uid
        and (
          now() < p.created_at + make_interval(days => coalesce(p.trial_days,30))  -- อยู่ในช่วงทดลอง
          or (p.paid_until is not null and now() < p.paid_until)                   -- จ่ายแล้วยังไม่หมดอายุ
        )
    );
$$;

-- 3) ฟังก์ชันดูสถานะของตัวเอง (ให้หน้าเว็บเรียกมาแสดงผล)
create or replace function public.my_access()
returns table(status text, trial_ends timestamptz, paid_until timestamptz, plan text, days_left int)
language sql security definer stable
set search_path = public as $$
  select
    case
      when public.is_admin() then 'admin'
      when p.paid_until is not null and now() < p.paid_until then 'active'
      when now() < p.created_at + make_interval(days => coalesce(p.trial_days,30)) then 'trial'
      else 'expired'
    end as status,
    p.created_at + make_interval(days => coalesce(p.trial_days,30)) as trial_ends,
    p.paid_until,
    p.plan,
    greatest(0, ceil(extract(epoch from (
      coalesce(
        case when p.paid_until is not null and now() < p.paid_until then p.paid_until end,
        p.created_at + make_interval(days => coalesce(p.trial_days,30))
      ) - now()
    )) / 86400))::int as days_left
  from public.profiles p
  where p.id = auth.uid();
$$;

-- 4) บังคับสิทธิ์กับข้อมูลเงินเดือน — หมดอายุแล้วอ่าน/เขียนไม่ได้
drop policy if exists "read own or admin"   on public.payroll_stores;
drop policy if exists "update own or admin" on public.payroll_stores;
drop policy if exists "insert own"          on public.payroll_stores;

create policy "read own or admin" on public.payroll_stores
  for select using ((auth.uid() = user_id and public.has_access()) or public.is_admin());

create policy "insert own" on public.payroll_stores
  for insert with check (auth.uid() = user_id and public.has_access());

create policy "update own or admin" on public.payroll_stores
  for update using ((auth.uid() = user_id and public.has_access()) or public.is_admin())
              with check ((auth.uid() = user_id and public.has_access()) or public.is_admin());

-- 5) ให้แอดมินแก้สิทธิ์ผู้ใช้ได้ (ต่ออายุ / เปลี่ยนแพ็กเกจ)
drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- วิธีต่ออายุให้ลูกค้าด้วยมือ (ตัวอย่าง: ต่อ 1 เดือน)
--   update public.profiles
--      set paid_until = greatest(coalesce(paid_until, now()), now()) + interval '1 month',
--          plan = '6-10 คน'
--    where email = 'customer@example.com';
-- ============================================================
