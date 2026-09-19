-- ============================================================
--  แพ็กเกจสำนักงานบัญชี — เปิดใช้งานอัตโนมัติหลังชำระเงิน
--
--  ราคา (คิดตามจำนวนบริษัทลูกค้า พนักงานไม่จำกัด)
--    1-10 บริษัท   4,900 บาท/เดือน
--    11-30 บริษัท  9,900 บาท/เดือน
--    เกิน 30       ขอใบเสนอราคา
--
--  ต้องรัน supabase-firm.sql ก่อนไฟล์นี้
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================

-- 1) เก็บประเภทบัญชีไว้ในคำสั่งซื้อและรายการชำระเงิน (ไว้ตรวจย้อนหลัง)
alter table public.orders   add column if not exists edition text;
alter table public.payments add column if not exists edition text;

-- 2) แปลงจำนวนบริษัทที่สั่งซื้อ → เพดานของแพ็กเกจนั้น
--    ต้องตรงกับตารางราคาในหน้าเว็บและใน Edge Function omise-charge
create or replace function public.firm_tier_max(n int)
returns int language sql immutable
set search_path = public as $$
  select case
    when n is null then null
    when n <= 10 then 10
    when n <= 30 then 30
    else null            -- เกิน 30 บริษัท = แพ็กเกจสั่งทำ ไม่บังคับเพดานที่ระบบ
  end;
$$;
revoke all on function public.firm_tier_max(int) from public, anon, authenticated;

-- 3) เปิดใช้งานหลังชำระเงิน — รองรับทั้งแบบบริษัทเดียวและสำนักงานบัญชี
--    ต้องลบตัวเก่าก่อน เพราะการเพิ่มพารามิเตอร์ = ฟังก์ชันคนละตัว (จะซ้อนกัน)
drop function if exists public.activate_verified_order(
  uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text,text);

create or replace function public.activate_verified_order(
  p_user      uuid,
  p_employees int,          -- แบบสำนักงานบัญชี = จำนวนบริษัท
  p_cycle     text,
  p_amount    numeric,
  p_plan      text,
  p_name      text,
  p_email     text,
  p_phone     text default null,
  p_btype     text default 'individual',
  p_tax_id    text default null,
  p_branch    text default null,
  p_addr      text default null,
  p_slip      text default null,
  p_trans_ref text default null,
  p_ptype     text default 'standard',
  p_edition   text default 'single'
)
returns timestamptz
language plpgsql security definer
set search_path = public as $$
declare
  v_from  timestamptz;
  v_until timestamptz;
  v_firm  boolean := (p_edition = 'firm');
begin
  if p_user is null then raise exception 'ไม่ระบุผู้ใช้'; end if;
  if p_cycle not in ('monthly','yearly') then raise exception 'รอบชำระไม่ถูกต้อง'; end if;
  if p_ptype not in ('standard','premium') then raise exception 'ระดับแพ็กเกจไม่ถูกต้อง'; end if;
  if p_edition not in ('single','firm') then raise exception 'ประเภทบัญชีไม่ถูกต้อง'; end if;

  select greatest(now(), coalesce(paid_until, now())) into v_from
  from public.profiles where id = p_user;
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;

  v_until := v_from + case when p_cycle='yearly' then interval '12 months' else interval '1 month' end;

  update public.profiles
     set paid_until    = v_until,
         plan          = p_plan,
         plan_type     = p_ptype,
         edition       = p_edition,
         -- สำนักงานบัญชี: พนักงานไม่จำกัด แต่จำกัดจำนวนบริษัท
         max_employees = case when v_firm then null else public.tier_max(p_employees) end,
         max_companies = case when v_firm then public.firm_tier_max(p_employees) else null end
   where id = p_user;

  insert into public.orders(
    user_id, company, email, phone, buyer_type, tax_id, branch, address,
    employees, plan, cycle, amount, status, slip_path, trans_ref, paid_at, verified, plan_type, edition)
  values(
    p_user, p_name, p_email, p_phone, p_btype, p_tax_id, p_branch, p_addr,
    p_employees, p_plan, p_cycle, p_amount, 'paid', p_slip, p_trans_ref, now(), true, p_ptype, p_edition);

  return v_until;
end $$;

revoke all on function public.activate_verified_order(
  uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.activate_verified_order(
  uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text,text,text)
  to service_role;

-- ============================================================
--  ตรวจผล — ต้องได้ t ทุกบรรทัด
-- ============================================================
select 'คอลัมน์ edition ใน orders' as item,
       exists(select 1 from information_schema.columns
              where table_name='orders' and column_name='edition') as ok
union all
select 'คอลัมน์ edition ใน payments',
       exists(select 1 from information_schema.columns
              where table_name='payments' and column_name='edition')
union all
select 'ซื้อ 10 บริษัท → เพดาน 10',  public.firm_tier_max(10) = 10
union all
select 'ซื้อ 11 บริษัท → เพดาน 30',  public.firm_tier_max(11) = 30
union all
select 'ซื้อ 30 บริษัท → เพดาน 30',  public.firm_tier_max(30) = 30
union all
select 'ซื้อ 31 บริษัท → ไม่จำกัด',   public.firm_tier_max(31) is null
union all
select 'activate_verified_order รับ p_edition',
       exists(select 1 from information_schema.routines r
               join information_schema.parameters pa on pa.specific_name = r.specific_name
              where r.routine_name='activate_verified_order' and pa.parameter_name='p_edition')
union all
select 'ไม่มีฟังก์ชันเปิดใช้งานซ้ำซ้อน',
       (select count(*) from pg_proc where proname='activate_verified_order') = 1;
