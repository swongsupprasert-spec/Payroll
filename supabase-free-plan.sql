-- ============================================================
--  ราคาใหม่ (ต.ค. 2569) + แพ็กเกจมาตรฐานฟรี 1-10 คน
--
--  บริษัทเดียว (มาตรฐาน / พรีเมี่ยม ต่อเดือน)
--    1-10 คน     ฟรี   / 590
--    11-30 คน    590   / 790
--    31-50 คน    990   / 1,490
--    51-80 คน    1,490 / 2,290
--    81-100 คน   2,290 / 2,990
--    101-150 คน  2,990 / 4,490
--    เกิน 150    ขอใบเสนอราคา
--  สำนักงานบัญชี
--    1-15 บริษัท 3,990 · 16-40 บริษัท 6,990 · เกิน 40 ขอใบเสนอราคา
--
--  กติกาแพ็กเกจฟรี
--   • บัญชีแบบบริษัทเดียว เมื่อหมดช่วงทดลองและไม่มีแพ็กเกจที่จ่ายอยู่
--     → ไม่ถูกล็อก แต่กลายเป็น "มาตรฐานฟรี" พนักงานได้ไม่เกิน 10 คน ไม่มีฟีเจอร์พรีเมี่ยม
--   • ใครมีพนักงานเกิน 10 คนอยู่แล้ว ยังเปิดดู/แก้ข้อมูลเดิมได้ แค่เพิ่มคนใหม่ไม่ได้
--   • สำนักงานบัญชีไม่มีแพ็กเกจฟรี — หมดทดลองแล้วยังต้องชำระเหมือนเดิม
--
--  ต้องรัน supabase-firm.sql และ supabase-firm-plan.sql มาก่อนแล้ว
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================

-- 1) เพดานพนักงานตามแพ็กเกจที่ซื้อ (ต้องตรงกับ pricing.html และ Edge Functions)
create or replace function public.tier_max(n int)
returns int language sql immutable
set search_path = public as $$
  select case
    when n is null then null
    when n <= 10  then 10
    when n <= 30  then 30
    when n <= 50  then 50
    when n <= 80  then 80
    when n <= 100 then 100
    when n <= 150 then 150
    else null            -- เกิน 150 คน = แพ็กเกจสั่งทำ ไม่บังคับเพดานที่ระบบ
  end;
$$;

-- 2) เพดานบริษัทของสำนักงานบัญชี
create or replace function public.firm_tier_max(n int)
returns int language sql immutable
set search_path = public as $$
  select case
    when n is null then null
    when n <= 15 then 15
    when n <= 40 then 40
    else null            -- เกิน 40 บริษัท = แพ็กเกจสั่งทำ
  end;
$$;
revoke all on function public.firm_tier_max(int) from public, anon, authenticated;

-- 3) สิทธิ์เข้าใช้ข้อมูลเงินเดือน — บริษัทเดียวใช้ได้เสมอ (อย่างน้อยแบบฟรี)
create or replace function public.has_access(uid uuid default auth.uid())
returns boolean language sql security definer stable
set search_path = public as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = uid
        and (
          now() < p.created_at + make_interval(days => coalesce(p.trial_days,30))
          or (p.paid_until is not null and now() < p.paid_until)
          or coalesce(p.edition,'single') = 'single'           -- แพ็กเกจมาตรฐานฟรี
        )
    );
$$;

-- 4) สถานะบัญชี — เพิ่มสถานะ 'free'
drop function if exists public.my_access();
create or replace function public.my_access()
returns table(status text, trial_ends timestamptz, paid_until timestamptz,
              plan text, plan_type text, premium boolean, days_left int,
              edition text, max_companies int)
language sql security definer stable
set search_path = public as $$
  select
    s.status,
    s.trial_ends,
    p.paid_until,
    case when s.status = 'free' then 'มาตรฐาน (ฟรี) 1-10 คน' else p.plan end as plan,
    case when s.status = 'free' then 'standard' else coalesce(p.plan_type,'standard') end as plan_type,
    (s.status in ('trial','admin')
     or (s.status = 'active' and coalesce(p.plan_type,'standard') = 'premium')) as premium,
    greatest(0, ceil(extract(epoch from (
      coalesce(
        case when p.paid_until is not null and now() < p.paid_until then p.paid_until end,
        s.trial_ends
      ) - now()
    )) / 86400))::int as days_left,
    coalesce(p.edition,'single') as edition,
    p.max_companies
  from public.profiles p
  cross join lateral (
    select
      case
        when public.is_admin() then 'admin'
        when p.paid_until is not null and now() < p.paid_until then 'active'
        when now() < p.created_at + make_interval(days => coalesce(p.trial_days,30)) then 'trial'
        when coalesce(p.edition,'single') = 'single' then 'free'
        else 'expired'
      end as status,
      p.created_at + make_interval(days => coalesce(p.trial_days,30)) as trial_ends
  ) s
  where p.id = auth.uid();
$$;
grant execute on function public.my_access() to authenticated;

-- 5) เพดานพนักงานของผู้ใช้ (null = ไม่จำกัด)
create or replace function public.emp_limit_of(uid uuid)
returns int language sql security definer stable
set search_path = public as $$
  select case
    when exists(select 1 from public.app_admins a where a.user_id = auth.uid()) then null
    when p.paid_until is not null and now() < p.paid_until then p.max_employees
    when now() < p.created_at + make_interval(days => coalesce(p.trial_days,30)) then null
    when coalesce(p.edition,'single') = 'firm' then null
    else 10                                                   -- แพ็กเกจมาตรฐานฟรี
  end
  from public.profiles p
  where p.id = uid;
$$;
revoke all on function public.emp_limit_of(uuid) from public, anon, authenticated;

-- ============================================================
--  ตรวจผล — ต้องได้ t ทุกบรรทัด
-- ============================================================
select '10 คน → เพดาน 10' as item,      public.tier_max(10)  = 10  as ok
union all select '101 คน → เพดาน 150',  public.tier_max(101) = 150
union all select '150 คน → เพดาน 150',  public.tier_max(150) = 150
union all select '151 คน → ไม่จำกัด',    public.tier_max(151) is null
union all select '15 บริษัท → เพดาน 15', public.firm_tier_max(15) = 15
union all select '16 บริษัท → เพดาน 40', public.firm_tier_max(16) = 40
union all select '41 บริษัท → ไม่จำกัด', public.firm_tier_max(41) is null
union all select 'my_access มีสถานะ free',
  position('''free''' in pg_get_functiondef('public.my_access()'::regprocedure)) > 0;
