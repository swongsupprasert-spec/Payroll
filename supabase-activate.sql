-- ============================================================
--  เปิดใช้งานอัตโนมัติหลังโอนเงิน (แนบสลิป → ต่ออายุทันที)
--  ไม่ต้องส่งเมล ไม่ต้องรอแอดมินยืนยัน
-- ============================================================

-- 1) คอลัมน์เพิ่มในตาราง orders
alter table public.orders add column if not exists user_id   uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists slip_path text;         -- ที่เก็บรูปสลิปใน storage
alter table public.orders add column if not exists paid_at   timestamptz;  -- เวลาที่กดเปิดใช้งาน
alter table public.orders add column if not exists verified  boolean not null default false;  -- แอดมินตรวจสลิปแล้ว

-- 2) ถังเก็บรูปสลิป (ส่วนตัว — เปิดอ่านตรง ๆ จากภายนอกไม่ได้)
insert into storage.buckets (id, name, public)
values ('slips','slips',false)
on conflict (id) do nothing;

-- ผู้ใช้ที่ล็อกอินอัปโหลดสลิปได้เฉพาะในโฟลเดอร์ของตัวเอง (ชื่อโฟลเดอร์ = user id)
drop policy if exists "upload own slip" on storage.objects;
create policy "upload own slip" on storage.objects
  for insert to authenticated
  with check (bucket_id='slips' and (storage.foldername(name))[1] = auth.uid()::text);

-- เจ้าของดูสลิปตัวเองได้ · แอดมินดูได้ทั้งหมด
drop policy if exists "read own slip or admin" on storage.objects;
create policy "read own slip or admin" on storage.objects
  for select to authenticated
  using (bucket_id='slips' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- 3) ฟังก์ชันเปิดใช้งาน — ต่ออายุให้บัญชีที่ล็อกอินอยู่ทันที
--    รายเดือน = +1 เดือน · รายปี = +12 เดือน (ต่อจากวันหมดอายุเดิมถ้ายังไม่หมด)
create or replace function public.activate_order(
  p_employees int,
  p_cycle     text,          -- 'monthly' | 'yearly'
  p_amount    numeric,
  p_plan      text,
  p_name      text,
  p_email     text,
  p_phone     text default null,
  p_btype     text default 'individual',
  p_tax_id    text default null,
  p_branch    text default null,
  p_addr      text default null,
  p_slip      text default null
)
returns timestamptz
language plpgsql security definer
set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_from  timestamptz;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนเปิดใช้งาน';
  end if;
  if p_cycle not in ('monthly','yearly') then
    raise exception 'รอบชำระไม่ถูกต้อง';
  end if;

  -- ต่อจากวันหมดอายุเดิมถ้ายังไม่หมด ไม่งั้นเริ่มนับจากวันนี้
  select greatest(now(), coalesce(paid_until, now())) into v_from
  from public.profiles where id = v_uid;

  v_until := v_from + case when p_cycle='yearly' then interval '12 months' else interval '1 month' end;

  update public.profiles
     set paid_until = v_until,
         plan       = p_plan
   where id = v_uid;

  insert into public.orders(
    user_id, company, email, phone, buyer_type, tax_id, branch, address,
    employees, plan, cycle, amount, status, slip_path, paid_at)
  values(
    v_uid, p_name, p_email, p_phone, p_btype, p_tax_id, p_branch, p_addr,
    p_employees, p_plan, p_cycle, p_amount, 'paid', p_slip, now());

  return v_until;
end $$;

revoke all on function public.activate_order(int,text,numeric,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.activate_order(int,text,numeric,text,text,text,text,text,text,text,text,text) to authenticated;

-- 4) ให้เจ้าของดูคำสั่งซื้อของตัวเองได้ (เดิมอ่านได้แต่แอดมิน)
drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
