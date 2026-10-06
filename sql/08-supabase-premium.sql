-- ============================================================
--  ระดับแพ็กเกจ: มาตรฐาน / พรีเมี่ยม
--  พรีเมี่ยม = ปลดล็อก เวลาเข้างาน + ระบบลางาน (รวมกะและกฎ OT)
--  ช่วงทดลองใช้ 30 วัน = ใช้ได้ครบทุกฟีเจอร์
-- ============================================================

-- 1) เก็บระดับแพ็กเกจไว้ในโปรไฟล์
alter table public.profiles add column if not exists plan_type text not null default 'standard';

-- 2) ให้หน้าเว็บอ่านระดับแพ็กเกจของตัวเองได้ (เพิ่ม plan_type + premium)
--    premium = true เมื่อ อยู่ในช่วงทดลอง / เป็นแอดมิน / จ่ายแบบพรีเมี่ยมและยังไม่หมดอายุ
drop function if exists public.my_access();
create or replace function public.my_access()
returns table(status text, trial_ends timestamptz, paid_until timestamptz,
              plan text, plan_type text, premium boolean, days_left int)
language sql security definer stable
set search_path = public as $$
  select
    s.status,
    s.trial_ends,
    p.paid_until,
    p.plan,
    coalesce(p.plan_type,'standard') as plan_type,
    (s.status in ('trial','admin')                                    -- ทดลอง/แอดมิน = ครบทุกฟีเจอร์
     or (s.status = 'active' and coalesce(p.plan_type,'standard') = 'premium')) as premium,
    greatest(0, ceil(extract(epoch from (
      coalesce(
        case when p.paid_until is not null and now() < p.paid_until then p.paid_until end,
        s.trial_ends
      ) - now()
    )) / 86400))::int as days_left
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

-- 3) ตอนเปิดใช้งานหลังชำระเงิน ให้บันทึกระดับแพ็กเกจด้วย
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
     set paid_until = v_until,
         plan       = p_plan,
         plan_type  = p_ptype
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

-- 4) เก็บระดับแพ็กเกจไว้ในคำสั่งซื้อด้วย (ไว้ตรวจย้อนหลัง)
alter table public.orders add column if not exists plan_type text;

-- 5) ตรวจผล — ต้องได้ t ทุกบรรทัด
select 'คอลัมน์ plan_type ใน profiles' as item,
       exists(select 1 from information_schema.columns
              where table_name='profiles' and column_name='plan_type') as ok
union all
select 'my_access คืนค่า premium',
       exists(select 1 from information_schema.routines r
              join information_schema.parameters pa on pa.specific_name=r.specific_name
              where r.routine_name='my_access' and pa.parameter_name='premium')
union all
select 'activate_verified_order รับ p_ptype',
       exists(select 1 from information_schema.parameters
              where specific_name in (select specific_name from information_schema.routines
                                      where routine_name='activate_verified_order')
                and parameter_name='p_ptype');
