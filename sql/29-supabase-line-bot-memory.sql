-- ============================================================
--  บอท LINE @esimpayroll (api/line-webhook.mjs)
--   1) line_bot_memory     — บริบทล่าสุดของแต่ละแชต เช่น จำนวนพนักงานที่ลูกค้าเพิ่งบอก
--                            และสถานะ "ส่งต่อแอดมิน" (บอทเงียบ 2 ชม.) — ไม่เก็บข้อความแชต
--   2) line_bot_unanswered — คำถามที่บอทตอบไม่ได้ / ตอบได้แค่แนะนำบทความ
--                            เปิดดูใน Table Editor → view "line_bot_unanswered_top"
--
--  • อ่าน/เขียนได้เฉพาะเซิร์ฟเวอร์ (service role) — ไม่มี policy ให้ anon/ผู้ใช้เว็บ
--  • ลบอัตโนมัติ: ความจำเก่าเกิน 1 วัน, คำถามที่ตอบไม่ได้เก่าเกิน 90 วัน (PDPA: เก็บเท่าที่จำเป็น)
-- ============================================================

create table if not exists public.line_bot_memory (
  user_id    text primary key,                    -- LINE userId (U...)
  mem        jsonb not null default '{}'::jsonb,  -- เช่น {"n":25,"topic":"price","handoff":1760000000000}
  updated_at timestamptz not null default now()
);
alter table public.line_bot_memory enable row level security;
revoke all on public.line_bot_memory from anon, authenticated;

create table if not exists public.line_bot_unanswered (
  id         bigint generated always as identity primary key,
  user_id    text,
  question   text not null,
  kind       text not null default 'none',        -- none = ตอบไม่ได้เลย · weak = แนะนำได้แค่บทความ
  created_at timestamptz not null default now()
);
create index if not exists line_bot_unanswered_created_idx on public.line_bot_unanswered (created_at desc);
alter table public.line_bot_unanswered enable row level security;
revoke all on public.line_bot_unanswered from anon, authenticated;

-- สรุปคำถามที่ตอบไม่ได้ เรียงตามที่ถามบ่อย (เปิดดูได้ใน Table Editor)
create or replace view public.line_bot_unanswered_top
with (security_invoker = true) as
select lower(btrim(question)) as question,
       count(*)              as times,
       count(distinct user_id) as people,
       max(kind)             as kind,
       max(created_at)       as last_asked
from public.line_bot_unanswered
group by 1
order by times desc, last_asked desc;
revoke all on public.line_bot_unanswered_top from anon, authenticated;

-- เก็บกวาด (บอทเรียกเองเป็นครั้งคราว)
create or replace function public.line_bot_memory_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.line_bot_memory     where updated_at < now() - interval '1 day';
  delete from public.line_bot_unanswered where created_at < now() - interval '90 days';
$$;
revoke all on function public.line_bot_memory_cleanup() from public, anon, authenticated;
