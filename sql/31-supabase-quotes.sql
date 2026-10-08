-- ============================================================
--  ใบเสนอราคา (เมนูผู้ดูแลระบบ → ใบเสนอราคา)
--
--  • เก็บใบเสนอราคาทุกใบ เปิด/พิมพ์ซ้ำ/คัดลอกได้
--  • เลขที่ออกอัตโนมัติตอนบันทึก รูปแบบ QT2569-0001 (ปี พ.ศ. ตามเวลาไทย · เริ่ม 0001 ใหม่ทุกปี)
--  • เฉพาะผู้ดูแลระบบ (is_admin) อ่าน/เขียนได้ — ลูกค้าทั่วไปมองไม่เห็น
--  (ต้องรันหลัง 02-supabase-admin.sql ที่มีฟังก์ชัน is_admin)
-- ============================================================

create table if not exists public.quotes (
  id          bigint generated always as identity primary key,
  quote_no    text unique,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  customer    text not null,                       -- ชื่อลูกค้า (ไว้ค้นหา/แสดงในรายการ)
  total       numeric not null default 0,
  valid_until date,
  status      text not null default 'issued',      -- issued | accepted | cancelled
  doc         jsonb not null default '{}'::jsonb   -- ข้อมูลทั้งใบ: ผู้ขาย ลูกค้า รายการ ส่วนลด หมายเหตุ
);
create index if not exists quotes_created_idx on public.quotes(created_at desc);

alter table public.quotes enable row level security;
drop policy if exists "admin manage quotes" on public.quotes;
create policy "admin manage quotes" on public.quotes
  for all using (public.is_admin()) with check (public.is_admin());

-- ตัวนับเลขที่ใบเสนอราคารายปี (พ.ศ.)
create table if not exists public.quote_counters (
  year int primary key,
  last int not null default 0
);
alter table public.quote_counters enable row level security;   -- ไม่มี policy = หน้าเว็บอ่าน/แก้ไม่ได้
revoke all on public.quote_counters from anon, authenticated;

create or replace function public.quotes_assign_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from (coalesce(new.created_at, now()) at time zone 'Asia/Bangkok'))::int + 543;
  n int;
begin
  if new.quote_no is null then
    insert into public.quote_counters(year, last) values (y, 1)
      on conflict (year) do update set last = quote_counters.last + 1
      returning last into n;
    new.quote_no := 'QT' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists quotes_assign_no on public.quotes;
create trigger quotes_assign_no before insert on public.quotes
  for each row execute function public.quotes_assign_no();

-- ตรวจผล — ต้องได้ true ทุกบรรทัด
select 'ตาราง quotes' as item,
       exists(select 1 from information_schema.tables where table_name='quotes') as ok
union all
select 'เปิด RLS แล้ว', (select relrowsecurity from pg_class where relname='quotes')
union all
select 'มี trigger ออกเลขที่', exists(select 1 from pg_trigger where tgname='quotes_assign_no');
