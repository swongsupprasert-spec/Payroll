-- ============================================================
--  ความจำของบอท LINE @esimpayroll (api/line-webhook.mjs)
--  เก็บแค่บริบทล่าสุดของแต่ละแชต เช่น จำนวนพนักงานที่ลูกค้าเพิ่งบอก
--  เพื่อให้ถามต่อได้ ("จ่ายรายปีล่ะ") — ไม่เก็บข้อความแชต
--
--  • อ่าน/เขียนได้เฉพาะเซิร์ฟเวอร์ (service role) — ไม่มี policy ให้ anon/ผู้ใช้เว็บ
--  • แถวที่ไม่ได้ใช้เกิน 1 วัน บอทจะไม่นำมาใช้ และลบทิ้งด้วยฟังก์ชันด้านล่าง
-- ============================================================

create table if not exists public.line_bot_memory (
  user_id    text primary key,          -- LINE userId (U...)
  mem        jsonb not null default '{}'::jsonb,  -- เช่น {"n":25,"topic":"price"}
  updated_at timestamptz not null default now()
);

alter table public.line_bot_memory enable row level security;
-- ไม่สร้าง policy = anon / authenticated เข้าถึงไม่ได้เลย (service role ข้าม RLS ได้)
revoke all on public.line_bot_memory from anon, authenticated;

-- ลบความจำที่เก่าเกิน 1 วัน (บอทเรียกเองเป็นครั้งคราว)
create or replace function public.line_bot_memory_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.line_bot_memory where updated_at < now() - interval '1 day';
$$;
revoke all on function public.line_bot_memory_cleanup() from public, anon, authenticated;
