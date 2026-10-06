-- ============================================================
--  จำกัดจำนวนพนักงานตามแพ็กเกจที่ชำระ
--  ล็อกที่ระดับฐานข้อมูล — ต่อให้แก้โค้ดหน้าเว็บก็เพิ่มเกินไม่ได้
--
--  กติกา
--   • นับเฉพาะ "พนักงานที่ยังทำงานอยู่" (ไม่มีวันที่ลาออก)
--     คนที่ลาออกแล้วยังอยู่ในระบบเพื่อออก 50 ทวิ / ภ.ง.ด.1 ย้อนหลังได้ แต่ไม่กินโควตา
--   • ช่วงทดลองใช้และแอดมิน = ไม่จำกัด (จะได้ประเมินระบบด้วยข้อมูลจริงทั้งบริษัท)
--   • ถ้าจำนวนเกินเพดานอยู่แล้ว (เช่น ซื้อแพ็กเกจเล็กกว่าจำนวนคนจริง)
--     ยังบันทึกข้อมูลเดิมได้ตามปกติ — ห้ามเฉพาะการ "เพิ่มคนใหม่"
--     (กันไม่ให้ลูกค้าถูกล็อกออกจากข้อมูลเงินเดือนของตัวเอง)
--
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================

-- 1) เพดานจำนวนพนักงานในโปรไฟล์ (null = ไม่จำกัด)
alter table public.profiles add column if not exists max_employees int;

-- 2) แปลงจำนวนพนักงานที่สั่งซื้อ → เพดานของแพ็กเกจนั้น
--    ต้องตรงกับตารางราคาในหน้าเว็บและใน Edge Function omise-charge
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
    else null            -- เกิน 100 คน = แพ็กเกจสั่งทำ ไม่บังคับเพดานที่ระบบ
  end;
$$;

-- 3) นับพนักงานที่ยังทำงานอยู่จากก้อน JSON
create or replace function public.emp_active_count(d jsonb)
returns int language sql immutable
set search_path = public as $$
  select coalesce((
    select count(*)::int
    from jsonb_array_elements(
      case when jsonb_typeof(d->'employees') = 'array' then d->'employees' else '[]'::jsonb end
    ) e
    where nullif(btrim(coalesce(e->>'resignDate','')), '') is null
  ), 0);
$$;

-- 4) เพดานของผู้ใช้คนหนึ่ง (null = ไม่จำกัด)
create or replace function public.emp_limit_of(uid uuid)
returns int language sql security definer stable
set search_path = public as $$
  select case
    -- แอดมินแก้ข้อมูลแทนลูกค้าได้เสมอ
    when exists(select 1 from public.app_admins a where a.user_id = auth.uid()) then null
    -- ยังไม่เคยจ่าย หรือหมดอายุแล้ว = อยู่ในช่วงทดลอง/หมดสิทธิ์ → ไม่บังคับเพดานตรงนี้
    when p.paid_until is null or now() >= p.paid_until then null
    else p.max_employees
  end
  from public.profiles p
  where p.id = uid;
$$;

-- 5) เพดานของฉัน + ใช้ไปเท่าไร (ให้หน้าเว็บเรียกอ่าน)
drop function if exists public.my_emp_quota();
create or replace function public.my_emp_quota()
returns table(max_employees int, used int)
language sql security definer stable
set search_path = public as $$
  select public.emp_limit_of(auth.uid()),
         coalesce((select public.emp_active_count(s.data)
                   from public.payroll_stores s where s.user_id = auth.uid()), 0);
$$;
grant execute on function public.my_emp_quota() to authenticated;

-- 6) ตัวล็อกจริง — ทริกเกอร์บนตารางข้อมูล
create or replace function public.enforce_emp_limit()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_limit int;
  v_new   int;
  v_old   int;
begin
  v_limit := public.emp_limit_of(new.user_id);
  if v_limit is null then return new; end if;          -- ไม่จำกัด

  v_new := public.emp_active_count(new.data);
  if v_new <= v_limit then return new; end if;         -- ยังไม่เกิน

  -- เกินเพดานแล้ว: ยอมให้บันทึกได้ถ้าไม่ได้เพิ่มจำนวนคน
  v_old := case when tg_op = 'UPDATE' then public.emp_active_count(old.data) else 0 end;
  if v_new <= v_old then return new; end if;

  raise exception
    'EMP_LIMIT: แพ็กเกจของคุณรองรับพนักงานสูงสุด % คน (กำลังจะบันทึก % คน) กรุณาอัปเกรดแพ็กเกจ',
    v_limit, v_new
    using errcode = 'check_violation', hint = 'upgrade_plan';
end $$;

drop trigger if exists trg_emp_limit on public.payroll_stores;
create trigger trg_emp_limit
  before insert or update on public.payroll_stores
  for each row execute function public.enforce_emp_limit();

-- 7) ตอนเปิดใช้งานหลังชำระเงิน ให้ตั้งเพดานตามแพ็กเกจที่ซื้อ
create or replace function public.activate_verified_order(
  p_user      uuid,
  p_employees int,
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
  p_ptype     text default 'standard'
)
returns timestamptz
language plpgsql security definer
set search_path = public as $$
declare
  v_from  timestamptz;
  v_until timestamptz;
begin
  if p_user is null then raise exception 'ไม่ระบุผู้ใช้'; end if;
  if p_cycle not in ('monthly','yearly') then raise exception 'รอบชำระไม่ถูกต้อง'; end if;
  if p_ptype not in ('standard','premium') then raise exception 'ระดับแพ็กเกจไม่ถูกต้อง'; end if;

  select greatest(now(), coalesce(paid_until, now())) into v_from
  from public.profiles where id = p_user;
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;

  v_until := v_from + case when p_cycle='yearly' then interval '12 months' else interval '1 month' end;

  update public.profiles
     set paid_until    = v_until,
         plan          = p_plan,
         plan_type     = p_ptype,
         max_employees = public.tier_max(p_employees)    -- ← เพดานตามแพ็กเกจ
   where id = p_user;

  insert into public.orders(
    user_id, company, email, phone, buyer_type, tax_id, branch, address,
    employees, plan, cycle, amount, status, slip_path, trans_ref, paid_at, verified)
  values(
    p_user, p_name, p_email, p_phone, p_btype, p_tax_id, p_branch, p_addr,
    p_employees, p_plan, p_cycle, p_amount, 'paid', p_slip, p_trans_ref, now(), true);

  return v_until;
end $$;

revoke all on function public.activate_verified_order(uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.activate_verified_order(uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text,text)
  to service_role;

-- 8) เติมเพดานให้ลูกค้าที่จ่ายเงินไปแล้วก่อนหน้านี้ (จากคำสั่งซื้อล่าสุด)
update public.profiles p
   set max_employees = public.tier_max(o.employees)
  from (
    select distinct on (user_id) user_id, employees
    from public.orders
    where status = 'paid'
    order by user_id, paid_at desc nulls last
  ) o
 where o.user_id = p.id
   and p.max_employees is null
   and p.paid_until is not null;

-- ============================================================
--  ตรวจผล — ต้องได้ t ทุกบรรทัด
-- ============================================================
select 'คอลัมน์ max_employees' as item,
       exists(select 1 from information_schema.columns
              where table_name='profiles' and column_name='max_employees') as ok
union all
select 'ทริกเกอร์ล็อกจำนวนพนักงาน',
       exists(select 1 from pg_trigger where tgname='trg_emp_limit')
union all
select 'นับคนที่ลาออกแล้วไม่กินโควตา',
       public.emp_active_count('{"employees":[{"name":"ก"},{"name":"ข","resignDate":"2026-01-31"}]}'::jsonb) = 1
union all
select 'แปลงแพ็กเกจ 8 คน → เพดาน 10',    public.tier_max(8)   = 10
union all
select 'แปลงแพ็กเกจ 30 คน → เพดาน 30',   public.tier_max(30)  = 30
union all
select 'แปลงแพ็กเกจ 51 คน → เพดาน 80',   public.tier_max(51)  = 80
union all
select 'แปลงแพ็กเกจ 100 คน → เพดาน 100', public.tier_max(100) = 100
union all
select 'แปลงแพ็กเกจ 150 คน → ไม่จำกัด',  public.tier_max(150) is null;
