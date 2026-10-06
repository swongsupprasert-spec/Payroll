-- ============================================================
--  ระบบหลายบริษัท สำหรับสำนักงานบัญชี
--
--  แนวคิด
--   • ผู้ใช้ 1 คน (สำนักงานบัญชี) ดูแลบริษัทลูกค้าได้หลายบริษัท
--   • ข้อมูลเงินเดือนแยกคนละแถวต่อบริษัท โครงข้างในเหมือนระบบเดิมเป๊ะ
--     แอปจึงใช้โค้ดคำนวณ/ออกเอกสารชุดเดิมได้ทั้งหมด ไม่ต้องเขียนใหม่
--   • จำนวนพนักงาน "ไม่จำกัด" — จำกัดที่จำนวนบริษัทแทน
--   • โควตานับทุกบริษัทรวมที่เก็บเข้าคลัง ต้องลบเท่านั้นถึงคืนโควตา
--   • ไม่มีระบบลงเวลาเข้างานและลางาน (ล็อกที่ตัวแอปตาม edition)
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) ประเภทบัญชี + เพดานจำนวนบริษัท
-- ------------------------------------------------------------
alter table public.profiles add column if not exists edition       text not null default 'single';
alter table public.profiles add column if not exists max_companies int;   -- null = ไม่จำกัด

comment on column public.profiles.edition is 'single = บริษัทเดียว (ระบบเดิม) · firm = สำนักงานบัญชี (หลายบริษัท)';

-- ------------------------------------------------------------
-- 2) เป็นบัญชีแบบสำนักงานบัญชีหรือไม่
-- ------------------------------------------------------------
create or replace function public.is_firm()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select p.edition = 'firm' from public.profiles p where p.id = auth.uid()), false);
$$;
grant execute on function public.is_firm() to authenticated;

-- ------------------------------------------------------------
-- 3) รายชื่อบริษัทลูกค้า
-- ------------------------------------------------------------
create table if not exists public.firm_companies (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  tax_id     text,
  branch     text,
  note       text,
  archived   boolean not null default false,   -- เลิกดูแลแล้ว แต่เก็บข้อมูลไว้ออกเอกสารย้อนหลัง
  created_at timestamptz not null default now()
);
create index if not exists idx_firm_companies_owner on public.firm_companies(owner_id, archived);

-- ------------------------------------------------------------
-- 4) ข้อมูลเงินเดือน แยกคนละแถวต่อบริษัท
-- ------------------------------------------------------------
create table if not exists public.firm_stores (
  company_id uuid primary key references public.firm_companies(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_touch_firm on public.firm_stores;
create trigger trg_touch_firm before update on public.firm_stores
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 5) RLS — เห็นเฉพาะบริษัทของตัวเอง
--    หมายเหตุ: "อ่าน" ไม่บังคับ is_firm() เพื่อไม่ให้ลูกค้าถูกล็อกออกจาก
--    ข้อมูลตัวเองถ้าถูกเปลี่ยนประเภทบัญชี — บังคับเฉพาะตอน "สร้างเพิ่ม"
-- ------------------------------------------------------------
alter table public.firm_companies enable row level security;

drop policy if exists "firm co read"   on public.firm_companies;
drop policy if exists "firm co insert" on public.firm_companies;
drop policy if exists "firm co update" on public.firm_companies;
drop policy if exists "firm co delete" on public.firm_companies;

create policy "firm co read"   on public.firm_companies
  for select using (auth.uid() = owner_id or public.is_admin());
create policy "firm co insert" on public.firm_companies
  for insert with check (auth.uid() = owner_id and public.is_firm());
create policy "firm co update" on public.firm_companies
  for update using (auth.uid() = owner_id or public.is_admin())
          with check (auth.uid() = owner_id or public.is_admin());
create policy "firm co delete" on public.firm_companies
  for delete using (auth.uid() = owner_id or public.is_admin());

alter table public.firm_stores enable row level security;

drop policy if exists "firm store read"   on public.firm_stores;
drop policy if exists "firm store insert" on public.firm_stores;
drop policy if exists "firm store update" on public.firm_stores;

create policy "firm store read" on public.firm_stores
  for select using (exists(
    select 1 from public.firm_companies c
    where c.id = firm_stores.company_id and (c.owner_id = auth.uid() or public.is_admin())));

create policy "firm store insert" on public.firm_stores
  for insert with check (exists(
    select 1 from public.firm_companies c
    where c.id = firm_stores.company_id and (c.owner_id = auth.uid() or public.is_admin())));

create policy "firm store update" on public.firm_stores
  for update using (exists(
    select 1 from public.firm_companies c
    where c.id = firm_stores.company_id and (c.owner_id = auth.uid() or public.is_admin())))
  with check (exists(
    select 1 from public.firm_companies c
    where c.id = firm_stores.company_id and (c.owner_id = auth.uid() or public.is_admin())));

-- ------------------------------------------------------------
-- 6) จำกัดจำนวนบริษัทตามแพ็กเกจ — ล็อกที่ฐานข้อมูล
--    นับทุกบริษัทรวมที่เก็บเข้าคลัง — ต้องลบเท่านั้นถึงคืนโควตา
-- ------------------------------------------------------------
create or replace function public.company_limit_of(uid uuid)
returns int language sql security definer stable
set search_path = public as $$
  select case
    when exists(select 1 from public.app_admins a where a.user_id = auth.uid()) then null
    else p.max_companies
  end
  from public.profiles p where p.id = uid;
$$;

drop function if exists public.my_company_quota();
create or replace function public.my_company_quota()
returns table(max_companies int, used int)
language sql security definer stable
set search_path = public as $$
  select public.company_limit_of(auth.uid()),
         (select count(*)::int from public.firm_companies c where c.owner_id = auth.uid());
$$;
grant execute on function public.my_company_quota() to authenticated;

create or replace function public.enforce_company_limit()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_limit int;
  v_used  int;
begin
  v_limit := public.company_limit_of(new.owner_id);
  if v_limit is null then return new; end if;

  select count(*) into v_used
    from public.firm_companies
   where owner_id = new.owner_id and id <> new.id;

  if v_used >= v_limit then
    raise exception 'COMPANY_LIMIT: แพ็กเกจของคุณเพิ่มบริษัทได้สูงสุด % บริษัท (ขณะนี้ %) — ลบบริษัทที่ไม่ใช้แล้วหรืออัปเกรดแพ็กเกจ',
      v_limit, v_used
      using errcode = 'check_violation', hint = 'upgrade_plan';
  end if;
  return new;
end $$;

drop trigger if exists trg_company_limit on public.firm_companies;
create trigger trg_company_limit
  before insert on public.firm_companies
  for each row execute function public.enforce_company_limit();

-- ------------------------------------------------------------
-- 7) ให้หน้าเว็บอ่านประเภทบัญชีของตัวเองได้ (เพิ่ม edition + max_companies)
-- ------------------------------------------------------------
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
    p.plan,
    coalesce(p.plan_type,'standard') as plan_type,
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
        else 'expired'
      end as status,
      p.created_at + make_interval(days => coalesce(p.trial_days,30)) as trial_ends
  ) s
  where p.id = auth.uid();
$$;
grant execute on function public.my_access() to authenticated;

-- ------------------------------------------------------------
-- 8) ปิดไม่ให้คนนอกเรียกฟังก์ชันภายใน
-- ------------------------------------------------------------
revoke all on function public.company_limit_of(uuid) from public, anon, authenticated;

-- ============================================================
--  ตรวจผล — ต้องได้ t ทุกบรรทัด
-- ============================================================
select 'คอลัมน์ edition ใน profiles' as item,
       exists(select 1 from information_schema.columns
              where table_name='profiles' and column_name='edition') as ok
union all
select 'คอลัมน์ max_companies',
       exists(select 1 from information_schema.columns
              where table_name='profiles' and column_name='max_companies')
union all
select 'ตาราง firm_companies',
       exists(select 1 from information_schema.tables where table_name='firm_companies')
union all
select 'ตาราง firm_stores',
       exists(select 1 from information_schema.tables where table_name='firm_stores')
union all
select 'เปิด RLS ทั้งสองตาราง',
       (select bool_and(relrowsecurity) from pg_class
         where relname in ('firm_companies','firm_stores'))
union all
select 'ทริกเกอร์จำกัดจำนวนบริษัท',
       exists(select 1 from pg_trigger where tgname='trg_company_limit')
union all
select 'my_access คืนค่า edition',
       exists(select 1 from information_schema.routines r
               join information_schema.parameters pa on pa.specific_name = r.specific_name
              where r.routine_name='my_access' and pa.parameter_name='edition')
union all
select 'ฟังก์ชัน is_firm',
       exists(select 1 from pg_proc where proname='is_firm');
