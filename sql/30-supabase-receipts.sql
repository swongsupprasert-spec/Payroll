-- ============================================================
--  ใบเสร็จรับเงิน: เลขที่เรียงต่อกันรายปี + ลูกค้าดาวน์โหลดย้อนหลังได้
--
--  • เลขที่ออกให้อัตโนมัติ "ครั้งเดียว" ตอนรายการชำระเงินเปลี่ยนเป็น successful
--    รูปแบบ RC2569-000001 (ปี พ.ศ. ตามเวลาไทย · เริ่ม 000001 ใหม่ทุกปี)
--  • เลขไม่ซ้ำ ไม่เปลี่ยน — เปิดใบเสร็จกี่ครั้งก็ได้เลขเดิม
--  • รายการที่จ่ายสำเร็จไปแล้วก่อนรันไฟล์นี้ ได้เลขย้อนหลังตามลำดับวันที่จ่าย
--  • ลูกค้าอ่านรายการของตัวเองได้อยู่แล้ว (policy "read own payments" ใน 10-supabase-omise.sql)
--  ผู้ให้บริการยังไม่จด VAT → เป็น "ใบเสร็จรับเงิน" ไม่ใช่ใบกำกับภาษี
--  (ต้องรันหลัง 10-supabase-omise.sql และ 14-supabase-firm-plan.sql)
-- ============================================================

alter table public.payments add column if not exists method     text;   -- promptpay | card (omise-charge บันทึกไว้)
alter table public.payments add column if not exists receipt_no text;
create unique index if not exists payments_receipt_no_key on public.payments(receipt_no) where receipt_no is not null;

-- ตัวนับเลขที่ใบเสร็จรายปี (พ.ศ.)
create table if not exists public.receipt_counters (
  year int primary key,
  last int not null default 0
);
alter table public.receipt_counters enable row level security;   -- ไม่มี policy = หน้าเว็บอ่าน/แก้ไม่ได้
revoke all on public.receipt_counters from anon, authenticated;

create or replace function public.next_receipt_no(p_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from (coalesce(p_at, now()) at time zone 'Asia/Bangkok'))::int + 543;
  n int;
begin
  insert into public.receipt_counters(year, last) values (y, 1)
    on conflict (year) do update set last = receipt_counters.last + 1
    returning last into n;
  return 'RC' || y || '-' || lpad(n::text, 6, '0');
end $$;
revoke all on function public.next_receipt_no(timestamptz) from public, anon, authenticated;

-- ออกเลขเมื่อรายการกลายเป็น successful (ทั้งตอน insert และ update)
create or replace function public.payments_assign_receipt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'successful' and new.receipt_no is null then
    new.receipt_no := public.next_receipt_no(coalesce(new.paid_at, now()));
  end if;
  return new;
end $$;

drop trigger if exists payments_assign_receipt on public.payments;
create trigger payments_assign_receipt
  before insert or update of status, receipt_no on public.payments
  for each row execute function public.payments_assign_receipt();

-- ออกเลขย้อนหลังให้รายการที่จ่ายสำเร็จไปแล้ว (เรียงตามวันที่จ่าย)
do $$
declare r record;
begin
  for r in select charge_id, coalesce(paid_at, created_at) as at from public.payments
           where status = 'successful' and receipt_no is null
           order by coalesce(paid_at, created_at), charge_id
  loop
    update public.payments set receipt_no = public.next_receipt_no(r.at) where charge_id = r.charge_id;
  end loop;
end $$;

-- ตรวจผล — ต้องได้ true ทุกบรรทัด
select 'คอลัมน์ receipt_no ใน payments' as item,
       exists(select 1 from information_schema.columns where table_name='payments' and column_name='receipt_no') as ok
union all
select 'มี trigger ออกเลขใบเสร็จ',
       exists(select 1 from pg_trigger where tgname='payments_assign_receipt')
union all
select 'รายการที่จ่ายแล้วมีเลขใบเสร็จครบ',
       not exists(select 1 from public.payments where status='successful' and receipt_no is null);
