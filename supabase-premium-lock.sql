-- ============================================================
--  ล็อกฟีเจอร์พรีเมี่ยมที่ระดับฐานข้อมูลจริง
--  แยกข้อมูล เวลาเข้างาน / ลางาน / กะ / กฎ OT ออกไปอีกตาราง
--  แล้วใช้ RLS กั้น — คนที่ไม่มีสิทธิ์อ่านหรือเขียนไม่ได้เลย
--  (ต้องรัน supabase-premium.sql ก่อน เพราะใช้คอลัมน์ plan_type)
-- ============================================================

-- 1) ตัวตัดสินสิทธิ์พรีเมี่ยม — ทดลอง 30 วัน / แอดมิน / จ่ายแบบพรีเมี่ยม
create or replace function public.is_premium(uid uuid default auth.uid())
returns boolean language sql security definer stable
set search_path = public as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = uid
        and (
          -- อยู่ในช่วงทดลองใช้ = ได้ครบทุกฟีเจอร์
          now() < p.created_at + make_interval(days => coalesce(p.trial_days,30))
          -- หรือจ่ายแบบพรีเมี่ยมและยังไม่หมดอายุ
          or (p.paid_until is not null and now() < p.paid_until
              and coalesce(p.plan_type,'standard') = 'premium')
        )
    );
$$;

-- 2) ตารางเก็บข้อมูลเฉพาะฟีเจอร์พรีเมี่ยม
create table if not exists public.premium_stores (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.premium_stores enable row level security;

-- อ่านได้เฉพาะเจ้าของที่มีสิทธิ์พรีเมี่ยม (แอดมินดูได้ทุกคน)
drop policy if exists "premium read" on public.premium_stores;
create policy "premium read" on public.premium_stores
  for select using ((auth.uid() = user_id and public.is_premium()) or public.is_admin());

-- เขียนได้เฉพาะเจ้าของที่มีสิทธิ์พรีเมี่ยม (แอดมินเขียนแทนได้)
drop policy if exists "premium insert" on public.premium_stores;
create policy "premium insert" on public.premium_stores
  for insert with check ((auth.uid() = user_id and public.is_premium()) or public.is_admin());

drop policy if exists "premium update" on public.premium_stores;
create policy "premium update" on public.premium_stores
  for update using ((auth.uid() = user_id and public.is_premium()) or public.is_admin())
          with check ((auth.uid() = user_id and public.is_premium()) or public.is_admin());

-- 3) ย้ายข้อมูลเดิมออกจากก้อนรวม → ตารางพรีเมี่ยม
insert into public.premium_stores(user_id, data)
select s.user_id,
       jsonb_strip_nulls(jsonb_build_object(
         'attend',           s.data->'attend',
         'leave',            s.data->'leave',
         'shifts',           s.data->'shifts',
         'shiftPlan',        s.data->'shiftPlan',
         'otWeekdays',       s.data->'otWeekdays',
         'otDates',          s.data->'otDates',
         'otMaxDay',         s.data->'otMaxDay',
         'leaveQuota',       s.data->'leaveQuota',
         'leaveHoursPerDay', s.data->'leaveHoursPerDay'
       ))
from public.payroll_stores s
on conflict (user_id) do update set data = excluded.data, updated_at = now();

-- 4) ลบคีย์พรีเมี่ยมออกจากก้อนรวม (ข้อมูลเงินเดือนไม่ถูกแตะ)
update public.payroll_stores
set data = data - 'attend' - 'leave' - 'shifts' - 'shiftPlan'
                - 'otWeekdays' - 'otDates' - 'otMaxDay'
                - 'leaveQuota' - 'leaveHoursPerDay';

-- 5) ตรวจผล — ต้องได้ t ทุกบรรทัด
select 'ตาราง premium_stores' as item,
       exists(select 1 from information_schema.tables where table_name='premium_stores') as ok
union all
select 'เปิด RLS แล้ว',
       (select relrowsecurity from pg_class where relname='premium_stores')
union all
select 'ฟังก์ชัน is_premium',
       exists(select 1 from pg_proc where proname='is_premium')
union all
select 'มี 3 policy',
       (select count(*) from pg_policies where tablename='premium_stores') = 3
union all
select 'ก้อนรวมไม่มีคีย์พรีเมี่ยมแล้ว',
       not exists(select 1 from public.payroll_stores where data ? 'attend' or data ? 'leave');
