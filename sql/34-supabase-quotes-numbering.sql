-- ============================================================
--  ใบเสนอราคา: เลขที่ "นับตามใบที่มีอยู่จริง" แทนตัวนับที่วิ่งไปเรื่อยๆ
--
--  เดิม: ทุกครั้งที่บันทึกจะ +1 จากตัวนับ แม้ใบนั้นถูกลบไปแล้ว → เลขกระโดด (0001 → 0006)
--  ใหม่: เลขถัดไป = เลขสูงสุดของใบที่ยังอยู่ในปีนั้น + 1
--        เช่น มี QT2569-0001 อยู่ใบเดียว → ใบถัดไปได้ QT2569-0002
--        ลบใบล่าสุดทิ้ง → เลขนั้นนำกลับมาใช้ได้ · ไม่มีวันได้เลขซ้ำกับใบที่ยังอยู่
--  ใบที่แก้เลขเองเป็นรูปแบบอื่น (เช่น BT-001) ไม่นับรวม
--  (ต้องรันหลัง 31-supabase-quotes.sql)
-- ============================================================

create or replace function public.quotes_assign_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from (coalesce(new.created_at, now()) at time zone 'Asia/Bangkok'))::int + 543;
  pre text := 'QT' || y || '-';
  n int;
begin
  if new.quote_no is null then
    perform pg_advisory_xact_lock(hashtext('quotes_assign_no'));   -- กันสองคนบันทึกพร้อมกันแล้วได้เลขเดียวกัน
    select coalesce(max(substring(quote_no from length(pre) + 1)::int), 0) + 1 into n
      from public.quotes
     where quote_no ~ ('^' || pre || '[0-9]+$');
    new.quote_no := pre || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

-- ตัวนับแบบเดิมไม่ใช้แล้ว
drop table if exists public.quote_counters;

-- ตรวจผล — เลขที่ใบถัดไปที่จะได้ (ต้องเป็นเลขต่อจากใบสูงสุดที่ยังอยู่)
select 'ใบถัดไปจะได้เลข' as item,
       'QT' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || '-' ||
       lpad((coalesce(max(substring(quote_no from 8)::int), 0) + 1)::text, 4, '0') as ok
  from public.quotes
 where quote_no ~ ('^QT' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || '-[0-9]+$');
