-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 7 — เพิ่มประเภทใบลา "อื่นๆ" (other)
-- ============================================================
alter table public.leave_requests drop constraint if exists leave_requests_type_check;
alter table public.leave_requests add constraint leave_requests_type_check
  check (type in ('sick','personal','vacation','maternity','ordination','unpaid','other'));

create or replace function public.checkin_leave_submit(p_token text, p_type text, p_from date, p_to date,
  p_hours numeric default null, p_reason text default '')
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; v_id bigint;
begin
  select cu.* into u from public.checkin_sessions s join public.checkin_users cu on cu.id = s.user_id
    where s.token = p_token and s.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  if p_type not in ('sick','personal','vacation','maternity','ordination','unpaid','other') then raise exception 'bad_type'; end if;
  if p_type = 'other' and length(trim(coalesce(p_reason,''))) < 2 then raise exception 'reason_required'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 90 then raise exception 'bad_date'; end if;
  if p_hours is not null and (p_hours <= 0 or p_hours > 24) then raise exception 'bad_hours'; end if;
  if (select count(*) from public.leave_requests where user_id = u.id and status = 'pending') >= 20 then
    raise exception 'too_many';
  end if;
  insert into public.leave_requests(owner_id, user_id, emp_id, emp_code, emp_name, type, from_date, to_date, hours, reason)
    values (u.owner_id, u.id, u.emp_id, u.emp_code, u.emp_name, p_type, p_from, p_to, p_hours, left(coalesce(p_reason,''), 500))
    returning id into v_id;
  return json_build_object('id', v_id);
end $$;
notify pgrst, 'reload schema';
