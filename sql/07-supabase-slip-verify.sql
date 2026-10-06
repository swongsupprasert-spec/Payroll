-- ============================================================
--  ปิดช่องโหว่แนบสลิป — หน้าเว็บเปิดใช้งานเองไม่ได้อีกต่อไป
--  ต้องผ่าน Edge Function verify-slip ที่ตรวจสลิปกับธนาคารก่อน
-- ============================================================

-- 1) ปิดสิทธิ์เดิม: ผู้ใช้เรียกฟังก์ชันเปิดใช้งานตรง ๆ ไม่ได้แล้ว
revoke execute on function public.activate_order(int,text,numeric,text,text,text,text,text,text,text,text,text)
  from authenticated, anon, public;

-- 2) หน้าเว็บ insert ตาราง orders ตรง ๆ ไม่ได้แล้ว (เดิมเปิดให้ทุกคน)
drop policy if exists "anyone insert orders" on public.orders;

-- 3) หน้าเว็บอัปโหลดสลิปเองไม่ได้แล้ว — Edge Function อัปโหลดให้ (service role ข้าม RLS)
drop policy if exists "upload own slip" on storage.objects;

-- 4) ตารางกันใช้สลิปซ้ำ — เลขอ้างอิงธนาคารใช้ได้ครั้งเดียวตลอดกาล
create table if not exists public.used_slips (
  trans_ref  text primary key,
  user_id    uuid references auth.users(id) on delete set null,
  amount     numeric,
  slip_date  timestamptz,
  created_at timestamptz not null default now()
);
alter table public.used_slips enable row level security;
drop policy if exists "admin read used_slips" on public.used_slips;
create policy "admin read used_slips" on public.used_slips
  for select using (public.is_admin());

-- 5) ตารางนับจำนวนครั้งที่ยิงตรวจ (กันยิงมั่วเปลืองเครดิต)
create table if not exists public.slip_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  employees  int,
  cycle      text,
  amount     numeric,
  created_at timestamptz not null default now()
);
create index if not exists slip_attempts_user_time on public.slip_attempts(user_id, created_at desc);
alter table public.slip_attempts enable row level security;
drop policy if exists "admin read slip_attempts" on public.slip_attempts;
create policy "admin read slip_attempts" on public.slip_attempts
  for select using (public.is_admin());

-- 6) เก็บเลขอ้างอิงไว้ในคำสั่งซื้อด้วย
alter table public.orders add column if not exists trans_ref text;
create unique index if not exists orders_trans_ref_uniq on public.orders(trans_ref) where trans_ref is not null;

-- 7) ฟังก์ชันเปิดใช้งานตัวใหม่ — เรียกได้เฉพาะ service role (Edge Function)
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
  p_trans_ref text default null
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

  -- ต่อจากวันหมดอายุเดิมถ้ายังไม่หมด ไม่งั้นเริ่มนับจากวันนี้
  select greatest(now(), coalesce(paid_until, now())) into v_from
  from public.profiles where id = p_user;
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;

  v_until := v_from + case when p_cycle='yearly' then interval '12 months' else interval '1 month' end;

  update public.profiles set paid_until = v_until, plan = p_plan where id = p_user;

  insert into public.orders(
    user_id, company, email, phone, buyer_type, tax_id, branch, address,
    employees, plan, cycle, amount, status, slip_path, trans_ref, paid_at, verified)
  values(
    p_user, p_name, p_email, p_phone, p_btype, p_tax_id, p_branch, p_addr,
    p_employees, p_plan, p_cycle, p_amount, 'paid', p_slip, p_trans_ref, now(), true);

  return v_until;
end $$;

revoke all on function public.activate_verified_order(uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.activate_verified_order(uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text)
  to service_role;

-- 8) ตรวจผล
select 'ปิดสิทธิ์ activate_order จาก authenticated' as item,
       not has_function_privilege('authenticated',
         'public.activate_order(int,text,numeric,text,text,text,text,text,text,text,text,text)','execute') as ok
union all
select 'ตาราง used_slips',    exists(select 1 from information_schema.tables where table_name='used_slips')
union all
select 'ตาราง slip_attempts', exists(select 1 from information_schema.tables where table_name='slip_attempts')
union all
select 'ฟังก์ชัน activate_verified_order', exists(select 1 from pg_proc where proname='activate_verified_order')
union all
select 'service_role เรียก activate_verified_order ได้',
       has_function_privilege('service_role',
         'public.activate_verified_order(uuid,int,text,numeric,text,text,text,text,text,text,text,text,text,text)','execute');
