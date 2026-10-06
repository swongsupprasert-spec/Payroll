-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 9 — แนบรูปในใบลา (เช่น ใบรับรองแพทย์)
--  เก็บเป็นรูปย่อ JPEG ไม่เกิน 3 รูปต่อใบ · เห็นได้เฉพาะเจ้าของใบลา ผู้อนุมัติ และแอดมินของบริษัท
-- ============================================================
alter table public.leave_requests add column if not exists attachments jsonb not null default '[]'::jsonb;
grant select (attachments) on public.leave_requests to authenticated;

drop function if exists public.checkin_leave_submit(text,text,date,date,numeric,text);
create or replace function public.checkin_leave_submit(p_token text, p_type text, p_from date, p_to date,
  p_hours numeric default null, p_reason text default '', p_files jsonb default '[]'::jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; v_id bigint; v_appr uuid; v_name text; f jsonb;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  if u.role = 'exec' then raise exception 'exec_no_leave'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  if p_type not in ('sick','personal','vacation','maternity','ordination','unpaid','other') then raise exception 'bad_type'; end if;
  if p_type = 'other' and length(trim(coalesce(p_reason,''))) < 2 then raise exception 'reason_required'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 90 then raise exception 'bad_date'; end if;
  if p_hours is not null and (p_hours <= 0 or p_hours > 24) then raise exception 'bad_hours'; end if;
  p_files := coalesce(p_files, '[]'::jsonb);
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 3 then raise exception 'too_many_files'; end if;
  for f in select * from jsonb_array_elements(p_files) loop
    if jsonb_typeof(f) <> 'string' or (f #>> '{}') !~ '^data:image/jpeg;base64,' or length(f #>> '{}') > 400000 then
      raise exception 'bad_file';
    end if;
  end loop;
  if (select count(*) from public.leave_requests where user_id = u.id and status = 'pending') >= 20 then raise exception 'too_many'; end if;
  v_appr := public.leave_route(u.owner_id, u.id);
  if v_appr is not null then select emp_name into v_name from public.checkin_users where id = v_appr; end if;
  insert into public.leave_requests(owner_id, user_id, emp_id, emp_code, emp_name, dept, type, from_date, to_date, hours, reason, approver_id, approver_name, attachments)
    values (u.owner_id, u.id, u.emp_id, u.emp_code, u.emp_name, u.dept, p_type, p_from, p_to, p_hours, left(coalesce(p_reason,''),500), v_appr, v_name, p_files)
    returning id into v_id;
  return json_build_object('id', v_id, 'approver_name', v_name);
end $$;
revoke all on function public.checkin_leave_submit(text,text,date,date,numeric,text,jsonb) from public;
grant execute on function public.checkin_leave_submit(text,text,date,date,numeric,text,jsonb) to anon, authenticated;

-- รูปแนบของใบลา (เจ้าของใบลาหรือผู้อนุมัติของใบนั้นเท่านั้น)
create or replace function public.checkin_leave_files(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; a jsonb;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  select attachments into a from public.leave_requests where id = p_id and (user_id = u.id or approver_id = u.id);
  if a is null then raise exception 'not_found'; end if;
  return a;
end $$;
revoke all on function public.checkin_leave_files(text,bigint) from public;
grant execute on function public.checkin_leave_files(text,bigint) to anon, authenticated;

-- รายการของตัวเอง / ของผู้อนุมัติ — บอกจำนวนรูปแนบ (ไม่ส่งตัวรูปทั้งหมดมาในรายการ)
create or replace function public.checkin_leave_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  return coalesce((select json_agg(x) from (
    select id, type, from_date, to_date, hours, reason, status, created_at, approver_name, decided_by_name, decide_note,
           jsonb_array_length(attachments) as files
    from public.leave_requests where user_id = u.id order by created_at desc limit 30) x), '[]'::json);
end $$;

create or replace function public.checkin_approvals_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  return json_build_object(
    'pending', coalesce((select json_agg(x) from (
      select id, emp_name, emp_code, dept, type, from_date, to_date, hours, reason, created_at, jsonb_array_length(attachments) as files
      from public.leave_requests where approver_id = u.id and status = 'pending' order by created_at) x), '[]'::json),
    'done', coalesce((select json_agg(x) from (
      select id, emp_name, emp_code, dept, type, from_date, to_date, hours, status, decide_note, decided_at, jsonb_array_length(attachments) as files
      from public.leave_requests where approver_id = u.id and status in ('approved','rejected')
      order by decided_at desc nulls last limit 30) x), '[]'::json));
end $$;
notify pgrst, 'reload schema';
