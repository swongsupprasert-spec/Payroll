-- ============================================================
--  37) ผู้ช่วย "ถามน้อง eSim" ในแอป — บันทึกคำถามที่บอทตอบไม่ได้
--  ผู้ใช้ที่ล็อกอินเพิ่มได้เฉพาะของตัวเอง · อ่าน/ลบได้เฉพาะผู้ดูแลระบบ (ต้องรันหลัง 02)
-- ============================================================
create table if not exists public.help_questions (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null default auth.uid(),
  page       text,
  question   text not null check (char_length(question) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table public.help_questions enable row level security;

drop policy if exists "help q insert own" on public.help_questions;
create policy "help q insert own" on public.help_questions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "help q admin read" on public.help_questions;
create policy "help q admin read" on public.help_questions
  for select using (public.is_admin());

drop policy if exists "help q admin delete" on public.help_questions;
create policy "help q admin delete" on public.help_questions
  for delete using (public.is_admin());

create index if not exists help_questions_created_idx on public.help_questions (created_at desc);

-- ตรวจผล: ต้องได้ ok = true
select (select relrowsecurity from pg_class where oid='public.help_questions'::regclass)
   and (select count(*) from pg_policies where tablename='help_questions') = 3 as ok;
