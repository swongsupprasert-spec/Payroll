-- ============================================================
--  ให้ผู้ดูแลระบบลบข้อความ "แจ้งปัญหา / คำแนะนำ" ได้ (ปุ่ม 🗑️ ในเมนูผู้ดูแลระบบ)
--  ผู้ใช้ทั่วไปยังส่งข้อความได้อย่างเดียว ลบ/อ่านไม่ได้
--  (ต้องรันหลัง 03-supabase-feedback.sql)
-- ============================================================

drop policy if exists "admin delete feedback" on public.feedback;
create policy "admin delete feedback" on public.feedback
  for delete using (public.is_admin());

-- ตรวจผล — ต้องได้ true
select 'แอดมินลบข้อความแจ้งปัญหาได้' as item,
       exists(select 1 from pg_policies where tablename='feedback' and policyname='admin delete feedback') as ok;
