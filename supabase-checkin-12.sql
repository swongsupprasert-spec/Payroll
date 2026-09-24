-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 12 — ลดปริมาณข้อมูลที่ดาวน์โหลด (Egress) ของ Supabase
--  เดิม: หน้าแอดมินดึงรูปถ่ายลงเวลาทุกใบทุกครั้งที่เปิดหน้า (รูปละ ~30KB)
--  ใหม่: ดึงแค่ "มีรูปหรือไม่" แล้วค่อยโหลดรูปตอนกดดู
-- ============================================================
alter table public.punches
  add column if not exists has_photo boolean generated always as (photo is not null) stored;

-- ลบรูปถ่ายลงเวลาที่เก่ากว่า 90 วัน (ของเดิมลบตอนมีคนลงเวลาใหม่เท่านั้น)
-- รันซ้ำได้ ปลอดภัย — ช่วยลดพื้นที่เก็บข้อมูลด้วย
update public.punches set photo = null
 where photo is not null and ts < now() - interval '90 days';

notify pgrst, 'reload schema';
