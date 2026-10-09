-- ============================================================
--  หน้า "แชต LINE" ในเมนูผู้ดูแลระบบ — ปุ่ม "ฉันตอบเอง" ให้บอทหยุดตอบลูกค้ารายนั้น 2 ชม.
--
--  line_bot_chats: ลูกค้าที่ทักเข้า LINE OA ล่าสุด (ชื่อ ข้อความล่าสุด เวลา) + สถานะหยุดบอท (paused_until)
--   • บอท (เซิร์ฟเวอร์) บันทึกทุกครั้งที่ลูกค้าส่งข้อความ
--   • ผู้ดูแลระบบอ่านและกด หยุด/ให้บอทตอบต่อ ได้ (แก้ได้แค่ช่องสถานะ)
--   • ลูกค้ามองไม่เห็นอะไรจากตารางนี้ · เก็บ 90 วันแล้วลบ (PDPA)
--  (ต้องรันหลัง 29-supabase-line-bot-memory.sql และ 02-supabase-admin.sql)
-- ============================================================

create table if not exists public.line_bot_chats (
  user_id      text primary key,                  -- LINE userId (U...)
  name         text,                              -- ชื่อในโปรไฟล์ LINE
  last_text    text,                              -- ข้อความล่าสุดของลูกค้า (ตัดไม่เกิน 300 ตัว)
  last_at      timestamptz not null default now(),
  paused_until timestamptz,                       -- บอทเงียบถึงเวลานี้ (แอดมินกด "ฉันตอบเอง" หรือลูกค้าขอคุยกับแอดมิน)
  paused_by    text                               -- admin | customer
);
create index if not exists line_bot_chats_last_idx on public.line_bot_chats(last_at desc);
alter table public.line_bot_chats enable row level security;

drop policy if exists "admin read line chats" on public.line_bot_chats;
create policy "admin read line chats" on public.line_bot_chats
  for select using (public.is_admin());
drop policy if exists "admin pause line chats" on public.line_bot_chats;
create policy "admin pause line chats" on public.line_bot_chats
  for update using (public.is_admin()) with check (public.is_admin());
-- แอดมินแก้ได้เฉพาะสถานะหยุดบอท ไม่แก้ชื่อ/ข้อความลูกค้า
revoke update on public.line_bot_chats from anon, authenticated;
grant update (paused_until, paused_by) on public.line_bot_chats to authenticated;
grant select on public.line_bot_chats to authenticated;
revoke all on public.line_bot_chats from anon;

-- เก็บกวาด: เพิ่มการลบแชตที่เงียบเกิน 90 วัน
create or replace function public.line_bot_memory_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.line_bot_memory     where updated_at < now() - interval '1 day';
  delete from public.line_bot_unanswered where created_at < now() - interval '90 days';
  delete from public.line_bot_chats      where last_at    < now() - interval '90 days';
$$;
revoke all on function public.line_bot_memory_cleanup() from public, anon, authenticated;

-- ตรวจผล — ต้องได้ true ทุกบรรทัด
select 'ตาราง line_bot_chats' as item, exists(select 1 from information_schema.tables where table_name='line_bot_chats') as ok
union all select 'แอดมินอ่านได้', exists(select 1 from pg_policies where tablename='line_bot_chats' and policyname='admin read line chats')
union all select 'แอดมินกดหยุด/ตอบต่อได้', exists(select 1 from pg_policies where tablename='line_bot_chats' and policyname='admin pause line chats');
