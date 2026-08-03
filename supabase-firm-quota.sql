-- ============================================================
--  แก้กติกาโควตาบริษัท + เปิดให้ลบบริษัทได้
--
--  เปลี่ยนจากเดิม
--    เดิม : บริษัทที่เก็บเข้าคลังแล้ว "ไม่นับ" โควตา
--    ใหม่ : นับทุกบริษัทรวมที่เก็บเข้าคลัง — ต้อง "ลบ" เท่านั้นถึงคืนโควตา
--
--  ผลที่ตามมา: การลบเป็นทางเดียวที่คืนโควตา และการลบจะลบข้อมูลเงินเดือน
--  ของบริษัทนั้นทิ้งถาวรด้วย (firm_stores ผูก on delete cascade)
--
--  ต้องรัน supabase-firm.sql มาก่อน
--  วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run
-- ============================================================

-- 1) นับโควตาจากทุกบริษัท ไม่เว้นที่เก็บเข้าคลัง
drop function if exists public.my_company_quota();
create or replace function public.my_company_quota()
returns table(max_companies int, used int, archived int)
language sql security definer stable
set search_path = public as $$
  select public.company_limit_of(auth.uid()),
         (select count(*)::int from public.firm_companies c where c.owner_id = auth.uid()),
         (select count(*)::int from public.firm_companies c where c.owner_id = auth.uid() and c.archived);
$$;
grant execute on function public.my_company_quota() to authenticated;

-- 2) ตัวล็อกจริง — นับทุกบริษัท และตรวจเฉพาะตอนเพิ่มใหม่
--    (การเก็บเข้าคลัง/นำกลับมาไม่ทำให้จำนวนเปลี่ยน จึงไม่ต้องตรวจตอนแก้ไข)
create or replace function public.enforce_company_limit()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_limit int;
  v_used  int;
begin
  v_limit := public.company_limit_of(new.owner_id);
  if v_limit is null then return new; end if;

  select count(*) into v_used
    from public.firm_companies
   where owner_id = new.owner_id and id <> new.id;

  if v_used >= v_limit then
    raise exception 'COMPANY_LIMIT: แพ็กเกจของคุณเพิ่มบริษัทได้สูงสุด % บริษัท (ขณะนี้ %) — ลบบริษัทที่ไม่ใช้แล้วหรืออัปเกรดแพ็กเกจ',
      v_limit, v_used
      using errcode = 'check_violation', hint = 'upgrade_plan';
  end if;
  return new;
end $$;

drop trigger if exists trg_company_limit on public.firm_companies;
create trigger trg_company_limit
  before insert on public.firm_companies      -- เฉพาะตอนเพิ่มใหม่
  for each row execute function public.enforce_company_limit();

-- ============================================================
--  ตรวจผล — ต้องได้ t ทุกบรรทัด
-- ============================================================
select 'ทริกเกอร์ทำงานเฉพาะตอนเพิ่มใหม่' as item,
       (select count(*) from pg_trigger t
         where t.tgname='trg_company_limit' and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 0) = 1 as ok
union all
select 'my_company_quota คืนค่า archived',
       exists(select 1 from information_schema.routines r
               join information_schema.parameters pa on pa.specific_name = r.specific_name
              where r.routine_name='my_company_quota' and pa.parameter_name='archived')
union all
select 'ลบบริษัทแล้วข้อมูลเงินเดือนถูกลบตาม',
       exists(select 1 from information_schema.referential_constraints rc
               join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
              where tc.table_name='firm_stores' and rc.delete_rule='CASCADE')
union all
select 'ผู้ใช้ลบบริษัทของตัวเองได้',
       exists(select 1 from pg_policies
              where tablename='firm_companies' and cmd='DELETE');
