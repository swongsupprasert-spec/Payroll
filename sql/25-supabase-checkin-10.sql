-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 10 — ปุ่ม "ใบลารออนุมัติ" ขึ้นเฉพาะคนที่เป็นผู้อนุมัติจริง
--  (ถูกตั้งเป็น CEO / ผู้อนุมัติแผนก / ข้อยกเว้นรายคน / ผู้อนุมัติแทน หรือเคยได้รับใบลาให้อนุมัติ)
-- ============================================================
create or replace function public.checkin_me(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; c public.checkin_config; last_p record; a jsonb; appr boolean;
begin
  u := public.checkin_session_user(p_token);
  if u.id is null then raise exception 'session'; end if;
  select * into c from public.checkin_config where owner_id = u.owner_id;
  select kind, ts into last_p from public.punches where user_id = u.id order by ts desc limit 1;
  a := c.approval;
  appr := u.role = 'exec'
    or exists (select 1 from public.leave_requests where approver_id = u.id)
    or (a is not null and coalesce((a->>'enabled')::boolean, false) and (
         a->>'ceo' = u.id::text
      or exists (select 1 from jsonb_each_text(coalesce(a->'depts','{}'::jsonb)) x where x.value = u.id::text)
      or exists (select 1 from jsonb_each_text(coalesce(a->'overrides','{}'::jsonb)) x where x.value = u.id::text)
      or exists (select 1 from jsonb_array_elements(coalesce(a->'delegates','[]'::jsonb)) d where d->>'to_user' = u.id::text)));
  return json_build_object(
    'emp_name', u.emp_name, 'emp_code', u.emp_code, 'company', c.company_name, 'role', u.role,
    'sites', c.sites, 'require_zone', c.require_zone, 'require_photo', c.require_photo,
    'require_face', c.require_face, 'face_enrolled', u.face_desc is not null,
    'premium', public.is_premium(u.owner_id),
    'pending_approvals', (select count(*) from public.leave_requests where approver_id = u.id and status = 'pending'),
    'is_approver', appr,
    'last_kind', last_p.kind, 'last_ts', last_p.ts);
end $$;
notify pgrst, 'reload schema';
