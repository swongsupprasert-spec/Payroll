-- ============================================================
--  ตาราง feedback — ข้อความแจ้งปัญหา/คำแนะนำจากผู้ใช้
--  ใครก็ส่งได้ (รวมคนไม่ล็อกอิน) · อ่านได้เฉพาะแอดมิน
-- ============================================================
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  kind       text,
  name       text,
  email      text,
  message    text not null,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

-- ใครก็ส่งข้อความได้ (anonymous + ล็อกอิน)
drop policy if exists "anyone insert feedback" on public.feedback;
create policy "anyone insert feedback" on public.feedback
  for insert to anon, authenticated with check (true);

-- อ่านได้เฉพาะแอดมิน (ใช้ฟังก์ชัน is_admin ที่สร้างไว้แล้ว)
drop policy if exists "admin read feedback" on public.feedback;
create policy "admin read feedback" on public.feedback
  for select using (public.is_admin());
