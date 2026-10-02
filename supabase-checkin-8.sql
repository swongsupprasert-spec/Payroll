-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 8 — สายอนุมัติใบลา (ขั้นเดียว)
--  • บัญชีมี 3 ประเภท: staff (พนักงาน) · head (หัวหน้า/ผู้จัดการ) · exec (ผู้บริหาร/CEO — อนุมัติอย่างเดียว)
--  • ใบลาไปหา: ข้อยกเว้นรายคน → ผู้อนุมัติของแผนก → ผู้อนุมัติสูงสุด (CEO)
--    ผู้อนุมัติของแผนกลาเอง → CEO · CEO ลาเอง / ปิดระบบ → HR (แอดมิน)
--  • ผู้อนุมัติแทนชั่วคราวตามช่วงวันที่
--  • ผู้อนุมัติกดแล้วจบ · HR แก้ในระบบลางานได้เสมอ
-- ============================================================
alter table public.checkin_users  add column if not exists role text not null default 'staff';
alter table public.checkin_users  drop constraint if exists checkin_users_role_check;
alter table public.checkin_users  add constraint checkin_users_role_check check (role in ('staff','head','exec'));
alter table public.checkin_users  add column if not exists dept text not null default '';
alter table public.checkin_config add column if not exists approval jsonb not null default '{}'::jsonb;
alter table public.leave_requests add column if not exists dept            text not null default '';
alter table public.leave_requests add column if not exists approver_id     uuid;
alter table public.leave_requests add column if not exists approver_name   text;
alter table public.leave_requests add column if not exists decided_by_name text;
alter table public.leave_requests add column if not exists decide_note     text;

grant select (role, dept) on public.checkin_users to authenticated;
grant update (role, dept, emp_name) on public.checkin_users to authenticated;
grant update (decided_by_name, decide_note) on public.leave_requests to authenticated;

-- หาใครเป็นผู้อนุมัติใบลาของพนักงานคนนี้ (คืน null = ไปที่ HR)
create or replace function public.leave_route(p_owner uuid, p_user uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare a jsonb; u public.checkin_users; v text; ceo uuid; d jsonb;
begin
  select approval into a from public.checkin_config where owner_id = p_owner;
  if a is null or coalesce((a->>'enabled')::boolean, false) = false then return null; end if;
  select * into u from public.checkin_users where id = p_user;
  ceo := nullif(a->>'ceo','')::uuid;
  v := a->'overrides'->>u.emp_id;                                   -- 1) ข้อยกเว้นรายคน
  if v is null or v = '' then
    v := a->'depts'->>u.dept;                                       -- 2) ผู้อนุมัติของแผนก
    if v is not null and v::uuid = u.id then v := null; end if;     --    หัวหน้าลาเอง → CEO
  end if;
  if v = 'ceo' then v := null; end if;
  if v is null or v = '' then v := ceo::text; end if;               -- 3) CEO
  if v is null or v::uuid = u.id then return null; end if;          -- CEO ลาเอง → HR
  -- ผู้อนุมัติแทนชั่วคราว
  for d in select * from jsonb_array_elements(coalesce(a->'delegates','[]'::jsonb)) loop
    if d->>'from_user' = v and current_date between (d->>'from')::date and (d->>'to')::date
       and nullif(d->>'to_user','') is not null and (d->>'to_user')::uuid <> u.id then
      v := d->>'to_user'; exit;
    end if;
  end loop;
  if not exists (select 1 from public.checkin_users where id = v::uuid and owner_id = p_owner and active) then
    return null;                                                    -- ผู้อนุมัติถูกปิดบัญชี → HR
  end if;
  return v::uuid;
end $$;
revoke all on function public.leave_route(uuid,uuid) from public, anon, authenticated;

create or replace function public.checkin_session_user(p_token text)
returns public.checkin_users language sql stable security definer set search_path = public as $$
  select cu.* from public.checkin_sessions s join public.checkin_users cu on cu.id = s.user_id
   where s.token = p_token and s.expires_at > now() and cu.active limit 1;
$$;
revoke all on function public.checkin_session_user(text) from public, anon, authenticated;

-- ข้อมูลตัวเอง + ประเภทบัญชี + จำนวนใบลารออนุมัติ
create or replace function public.checkin_me(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; c public.checkin_config; last_p record;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  select * into c from public.checkin_config where owner_id = u.owner_id;
  select kind, ts into last_p from public.punches where user_id = u.id order by ts desc limit 1;
  return json_build_object(
    'emp_name', u.emp_name, 'emp_code', u.emp_code, 'company', c.company_name, 'role', u.role,
    'sites', c.sites, 'require_zone', c.require_zone, 'require_photo', c.require_photo,
    'require_face', c.require_face, 'face_enrolled', u.face_desc is not null,
    'premium', public.is_premium(u.owner_id),
    'pending_approvals', (select count(*) from public.leave_requests where approver_id = u.id and status = 'pending'),
    'last_kind', last_p.kind, 'last_ts', last_p.ts);
end $$;

-- ผู้บริหาร (exec) ลงเวลาไม่ได้
create or replace function public.checkin_block_exec_punch() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.checkin_users where id = new.user_id and role = 'exec') then
    raise exception 'exec_no_punch';
  end if;
  return new;
end $$;
drop trigger if exists punches_block_exec on public.punches;
create trigger punches_block_exec before insert on public.punches for each row execute function public.checkin_block_exec_punch();

-- ยื่นใบลา (กำหนดผู้อนุมัติให้เลย)
create or replace function public.checkin_leave_submit(p_token text, p_type text, p_from date, p_to date,
  p_hours numeric default null, p_reason text default '')
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; v_id bigint; v_appr uuid; v_name text;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  if u.role = 'exec' then raise exception 'exec_no_leave'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  if p_type not in ('sick','personal','vacation','maternity','ordination','unpaid','other') then raise exception 'bad_type'; end if;
  if p_type = 'other' and length(trim(coalesce(p_reason,''))) < 2 then raise exception 'reason_required'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 90 then raise exception 'bad_date'; end if;
  if p_hours is not null and (p_hours <= 0 or p_hours > 24) then raise exception 'bad_hours'; end if;
  if (select count(*) from public.leave_requests where user_id = u.id and status = 'pending') >= 20 then raise exception 'too_many'; end if;
  v_appr := public.leave_route(u.owner_id, u.id);
  if v_appr is not null then select emp_name into v_name from public.checkin_users where id = v_appr; end if;
  insert into public.leave_requests(owner_id, user_id, emp_id, emp_code, emp_name, dept, type, from_date, to_date, hours, reason, approver_id, approver_name)
    values (u.owner_id, u.id, u.emp_id, u.emp_code, u.emp_name, u.dept, p_type, p_from, p_to, p_hours, left(coalesce(p_reason,''),500), v_appr, v_name)
    returning id into v_id;
  return json_build_object('id', v_id, 'approver_name', v_name);
end $$;

-- ใบลาของตัวเอง
create or replace function public.checkin_leave_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  return coalesce((select json_agg(x) from (
    select id, type, from_date, to_date, hours, reason, status, created_at, approver_name, decided_by_name, decide_note
    from public.leave_requests where user_id = u.id order by created_at desc limit 30) x), '[]'::json);
end $$;

-- ใบลาที่ต้องอนุมัติ (รออนุมัติ + ที่ตัดสินไปแล้ว 30 ใบล่าสุด)
create or replace function public.checkin_approvals_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  return json_build_object(
    'pending', coalesce((select json_agg(x) from (
      select id, emp_name, emp_code, dept, type, from_date, to_date, hours, reason, created_at
      from public.leave_requests where approver_id = u.id and status = 'pending' order by created_at) x), '[]'::json),
    'done', coalesce((select json_agg(x) from (
      select id, emp_name, emp_code, dept, type, from_date, to_date, hours, status, decide_note, decided_at
      from public.leave_requests where approver_id = u.id and status in ('approved','rejected')
      order by decided_at desc nulls last limit 30) x), '[]'::json));
end $$;

-- อนุมัติ / ไม่อนุมัติ
create or replace function public.checkin_approve(p_token text, p_id bigint, p_ok boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare u public.checkin_users;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  if not coalesce(p_ok, false) and length(trim(coalesce(p_note,''))) < 2 then raise exception 'note_required'; end if;
  update public.leave_requests
     set status = case when p_ok then 'approved' else 'rejected' end,
         decided_at = now(), decided_by_name = u.emp_name, decide_note = left(coalesce(p_note,''),300)
   where id = p_id and approver_id = u.id and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;

revoke all on function public.checkin_approvals_list(text) from public;
revoke all on function public.checkin_approve(text,bigint,boolean,text) from public;
grant execute on function public.checkin_approvals_list(text) to anon, authenticated;
grant execute on function public.checkin_approve(text,bigint,boolean,text) to anon, authenticated;
notify pgrst, 'reload schema';
