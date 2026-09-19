-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 2 — แอดมินตั้งชื่อผู้ใช้และรหัสผ่านเองได้
--  (รันหลัง supabase-checkin.sql)
--  • ชื่อผู้ใช้ = คอลัมน์ emp_code (ไม่จำเป็นต้องตรงกับรหัสพนักงาน)
--  • รหัสผ่าน 4–32 ตัวอักษร (เดิมต้องเป็นตัวเลข 4–8 หลัก)
--  • 1 พนักงาน = 1 บัญชี — เปลี่ยนชื่อผู้ใช้ได้โดยไม่เกิดบัญชีซ้ำ
-- ============================================================

create or replace function public.checkin_set_user(p_emp_id text, p_emp_code text, p_emp_name text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_login text := upper(trim(coalesce(p_emp_code,'')));
begin
  if auth.uid() is null or not public.is_premium(auth.uid()) then raise exception 'not_premium'; end if;
  if v_login !~ '^[A-Z0-9._-]{3,30}$' then raise exception 'bad_login'; end if;
  if length(coalesce(p_pin,'')) < 4 or length(p_pin) > 32 then raise exception 'bad_pin'; end if;
  -- ชื่อผู้ใช้ซ้ำกับพนักงานคนอื่นในบริษัทเดียวกันไม่ได้
  if exists (select 1 from public.checkin_users
             where owner_id = auth.uid() and emp_code = v_login and emp_id <> p_emp_id) then
    raise exception 'login_taken';
  end if;
  select id into v_id from public.checkin_users where owner_id = auth.uid() and emp_id = p_emp_id limit 1;
  if v_id is null then
    insert into public.checkin_users(owner_id, emp_id, emp_code, emp_name, pin_hash)
      values (auth.uid(), p_emp_id, v_login, coalesce(p_emp_name,''), crypt(p_pin, gen_salt('bf')))
      returning id into v_id;
  else
    update public.checkin_users
      set emp_code = v_login, emp_name = coalesce(p_emp_name,''), pin_hash = crypt(p_pin, gen_salt('bf')),
          active = true, fail_count = 0, locked_until = null
      where id = v_id;
  end if;
  delete from public.checkin_sessions where user_id = v_id;   -- เปลี่ยนรหัส = เด้งออกจากทุกเครื่อง
  return v_id;
end $$;

revoke all on function public.checkin_set_user(text,text,text,text) from public, anon;
grant execute on function public.checkin_set_user(text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
