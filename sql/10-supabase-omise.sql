-- ============================================================
--  รับชำระเงินผ่าน Omise (พร้อมเพย์ QR)
--  ตารางนี้เป็นตัวกัน webhook ยิงซ้ำ และให้หน้าเว็บ poll สถานะ
--  (ต้องรัน supabase-premium.sql ก่อน เพราะใช้ activate_verified_order)
-- ============================================================

create table if not exists public.payments (
  charge_id   text primary key,               -- รหัสรายการจาก Omise = กันยิงซ้ำ
  user_id     uuid references auth.users(id) on delete set null,
  amount      numeric not null,               -- บาท (เก็บเป็นบาทให้อ่านง่าย)
  currency    text not null default 'THB',
  employees   int,
  cycle       text,                           -- monthly | yearly
  ptype       text,                           -- standard | premium
  plan        text,
  -- ข้อมูลผู้ซื้อ เก็บไว้ให้ webhook เอาไปออกใบเสร็จ/ต่ออายุ
  buyer_name  text, buyer_email text, buyer_phone text,
  buyer_type  text, tax_id text, branch text, address text,
  status      text not null default 'pending',-- pending | successful | failed | expired
  qr_uri      text,
  paid_until  timestamptz,                    -- วันหมดอายุใหม่หลังต่ออายุสำเร็จ
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists payments_user_time on public.payments(user_id, created_at desc);

alter table public.payments enable row level security;

-- เจ้าของดูรายการของตัวเองได้ (ใช้ poll สถานะระหว่างรอจ่าย) · แอดมินดูได้ทุกคน
drop policy if exists "read own payments" on public.payments;
create policy "read own payments" on public.payments
  for select using (auth.uid() = user_id or public.is_admin());

-- เขียนได้เฉพาะ service role (Edge Function) — หน้าเว็บสร้าง/แก้รายการเองไม่ได้
-- ไม่ต้องสร้าง policy insert/update เลย เพราะ service role ข้าม RLS อยู่แล้ว

-- ตรวจผล — ต้องได้ true ทั้ง 3 บรรทัด
select 'ตาราง payments' as item,
       exists(select 1 from information_schema.tables where table_name='payments') as ok
union all
select 'เปิด RLS แล้ว',
       (select relrowsecurity from pg_class where relname='payments')
union all
select 'มีฟังก์ชันต่ออายุให้เรียก',
       exists(select 1 from pg_proc where proname='activate_verified_order');
