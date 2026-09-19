-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 4 — แอดมินตั้งรหัสบริษัทเองได้
--  รหัสบริษัท: A-Z และ 0-9 ยาว 4–12 ตัว (เดิมบังคับ 6 ตัวสุ่ม) · ห้ามซ้ำกับบริษัทอื่น (unique เดิม)
-- ============================================================
drop policy if exists "checkin config owner" on public.checkin_config;
create policy "checkin config owner" on public.checkin_config
  for all using (auth.uid() = owner_id and public.is_premium())
  with check (auth.uid() = owner_id and public.is_premium() and code ~ '^[A-Z0-9]{4,12}$');
notify pgrst, 'reload schema';
