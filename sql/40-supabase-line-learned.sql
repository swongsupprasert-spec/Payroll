-- ============================================================
--  บอท LINE "จำคำตอบแอดมิน" — แอดมินบันทึกคำถาม+คำตอบที่ตอบลูกค้าไปแล้ว
--  ครั้งหน้าลูกค้าถามคล้าย ๆ กัน บอทตอบด้วยคำตอบนี้ให้เอง (ฟรี ไม่ใช้ AI แบบเสียเงิน)
--
--  line_bot_learned:
--   • ผู้ดูแลระบบ เพิ่ม/แก้/ปิดใช้ ได้จากหน้า "แชต LINE"
--   • บอท (เซิร์ฟเวอร์ ใช้ service role) อ่านเฉพาะรายการที่ active
--   • ลูกค้ามองไม่เห็นตารางนี้
--  (ต้องรันหลัง 02-supabase-admin.sql และ 36-supabase-line-chats.sql)
-- ============================================================

create table if not exists public.line_bot_learned (
  id          bigint generated always as identity primary key,
  question    text not null check (length(question) between 2 and 500),   -- คำถามลูกค้า (ใส่หลายแบบได้ คั่นด้วย |)
  answer      text not null check (length(answer) between 1 and 2000),   -- คำตอบของแอดมิน
  active      boolean not null default true,
  uses        integer not null default 0,                                 -- บอทใช้คำตอบนี้ไปกี่ครั้ง
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.line_bot_learned enable row level security;

drop policy if exists "admin manage line learned" on public.line_bot_learned;
create policy "admin manage line learned" on public.line_bot_learned
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.line_bot_learned from anon;
grant select, insert, update on public.line_bot_learned to authenticated;

-- บอทนับจำนวนครั้งที่ใช้คำตอบ (เรียกด้วย service role เท่านั้น)
create or replace function public.line_bot_learned_used(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.line_bot_learned set uses = uses + 1 where id = p_id;
$$;
revoke all on function public.line_bot_learned_used(bigint) from public, anon, authenticated;

-- ตรวจผล — ต้องได้ true ทุกบรรทัด
select 'ตาราง line_bot_learned' as item, exists(select 1 from information_schema.tables where table_name='line_bot_learned') as ok
union all select 'แอดมินจัดการได้', exists(select 1 from pg_policies where tablename='line_bot_learned' and policyname='admin manage line learned');
