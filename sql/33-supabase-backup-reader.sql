-- ============================================================
--  บัญชีฐานข้อมูล "อ่านอย่างเดียว" สำหรับสำรองข้อมูลอัตโนมัติ (scripts/backup)
--
--  ⚠️ ก่อนกด Run: เปลี่ยน  ใส่รหัสผ่านยาวๆที่นี่  ในบรรทัด create role
--     เป็นรหัสผ่านใหม่ที่คุณตั้งเอง (ยาว 20 ตัวขึ้นไป) — ห้ามใช้รหัสเดียวกับบัญชีอื่น
--     และห้ามส่งรหัสนี้ในแชต · เก็บไว้ใส่ตอนรัน setup ของสคริปต์สำรองข้อมูลเท่านั้น
--
--  บัญชีนี้ทำได้แค่ "อ่าน" ตารางใน public — เขียน แก้ ลบ ไม่ได้
--  อ่านข้ามสิทธิ์รายแถว (RLS) ได้ เพื่อให้สำรองข้อมูลได้ครบทุกบัญชีลูกค้า
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader login bypassrls password 'ใส่รหัสผ่านยาวๆที่นี่';
  end if;
end $$;
alter role backup_reader set default_transaction_read_only = on;   -- กันพลาด: ทุกคำสั่งเป็นแบบอ่านอย่างเดียว
alter role backup_reader connection limit 2;

grant usage on schema public to backup_reader;
grant select on all tables in schema public to backup_reader;
alter default privileges in schema public grant select on tables to backup_reader;   -- ตารางใหม่ในอนาคตด้วย

-- ตรวจผล — ต้องได้ true ทุกบรรทัด
select 'มีบัญชี backup_reader' as item, exists(select 1 from pg_roles where rolname='backup_reader') as ok
union all
select 'อ่านข้าม RLS ได้ (สำรองครบทุกบัญชี)', (select rolbypassrls from pg_roles where rolname='backup_reader')
union all
select 'อ่านตาราง payroll_stores ได้', has_table_privilege('backup_reader','public.payroll_stores','select')
union all
select 'เขียนตาราง payroll_stores ไม่ได้', not has_table_privilege('backup_reader','public.payroll_stores','insert,update,delete');
-- ลืมเปลี่ยนรหัสผ่านก่อนรัน? ตั้งใหม่ได้ด้วย:  alter role backup_reader password 'รหัสผ่านใหม่ของคุณ';
