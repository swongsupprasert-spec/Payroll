-- ============================================================
--  ตาราง orders — คำสั่งซื้อ/ต่ออายุแพ็กเกจ
--  ใครก็สั่งซื้อได้ (รวมคนไม่ล็อกอิน) · อ่านได้เฉพาะแอดมิน
-- ============================================================
create table if not exists public.orders (
  id         bigint generated always as identity primary key,
  company    text not null,
  email      text not null,
  phone      text,
  employees  int,
  plan       text,
  cycle      text,                      -- monthly | yearly
  amount     numeric,
  status     text default 'pending',    -- pending | paid | cancelled
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;

-- ใครก็สั่งซื้อได้
drop policy if exists "anyone insert orders" on public.orders;
create policy "anyone insert orders" on public.orders
  for insert to anon, authenticated with check (true);

-- อ่าน/อัปเดตสถานะได้เฉพาะแอดมิน (ใช้ฟังก์ชัน is_admin ที่มีอยู่แล้ว)
drop policy if exists "admin read orders" on public.orders;
create policy "admin read orders" on public.orders
  for select using (public.is_admin());

drop policy if exists "admin update orders" on public.orders;
create policy "admin update orders" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

-- ============================================================
--  เพิ่มเติม: ประเภทผู้ซื้อ + ข้อมูลออกใบกำกับภาษี
-- ============================================================
alter table public.orders add column if not exists buyer_type text;   -- individual | juristic
alter table public.orders add column if not exists tax_id     text;   -- เลขผู้เสียภาษี 13 หลัก
alter table public.orders add column if not exists branch     text;   -- สำนักงานใหญ่ / สาขา
alter table public.orders add column if not exists address    text;   -- ที่อยู่ออกใบกำกับภาษี
