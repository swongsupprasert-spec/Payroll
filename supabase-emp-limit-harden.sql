-- ============================================================
--  ปิดช่องเรียกฟังก์ชันเพดานพนักงานจากภายนอก
--  รันหลังจาก supabase-emp-limit.sql
--
--  ปัญหา: emp_limit_of(uid) เรียกได้โดยไม่ต้องล็อกอิน และรับ user id อะไรก็ได้
--         ทำให้คนนอกถามได้ว่าลูกค้ารายนั้นซื้อแพ็กเกจรองรับกี่คน
--  แก้:   ถอนสิทธิ์เรียกจากคนนอกทั้งหมด
--         ทริกเกอร์และ my_emp_quota ยังทำงานได้ปกติ เพราะเป็น security definer
--         (รันด้วยสิทธิ์เจ้าของฟังก์ชัน ไม่ได้ใช้สิทธิ์ของผู้เรียก)
-- ============================================================

revoke all on function public.emp_limit_of(uuid)     from public, anon, authenticated;
revoke all on function public.emp_active_count(jsonb) from public, anon, authenticated;
revoke all on function public.tier_max(int)           from public, anon, authenticated;

-- ช่องทางเดียวที่หน้าเว็บควรใช้ = ถามเพดานของ "ตัวเอง" เท่านั้น
grant execute on function public.my_emp_quota() to authenticated;

-- ============================================================
--  ตรวจผล — ต้องได้ f ทั้ง 3 บรรทัดแรก (คนนอกเรียกไม่ได้แล้ว)
--  และ t บรรทัดสุดท้าย (ผู้ใช้ที่ล็อกอินยังถามเพดานตัวเองได้)
-- ============================================================
select 'anon เรียก emp_limit_of ได้'      as item,
       has_function_privilege('anon',  'public.emp_limit_of(uuid)',      'execute') as ok
union all
select 'anon เรียก emp_active_count ได้',
       has_function_privilege('anon',  'public.emp_active_count(jsonb)', 'execute')
union all
select 'anon เรียก tier_max ได้',
       has_function_privilege('anon',  'public.tier_max(int)',           'execute')
union all
select 'ผู้ใช้ที่ล็อกอินถามเพดานตัวเองได้',
       has_function_privilege('authenticated', 'public.my_emp_quota()',  'execute');
