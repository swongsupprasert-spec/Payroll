-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 5 — แอดมินแก้ไข/ลบรายการลงเวลาได้
--  เก็บร่องรอยว่ารายการไหนถูกแก้ และเวลาเดิมก่อนแก้คืออะไร
-- ============================================================
alter table public.punches add column if not exists edited_at timestamptz;
alter table public.punches add column if not exists orig_ts   timestamptz;
alter table public.punches add column if not exists orig_kind text;

grant update (kind, ts, merged, edited_at, orig_ts, orig_kind) on public.punches to authenticated;
notify pgrst, 'reload schema';
