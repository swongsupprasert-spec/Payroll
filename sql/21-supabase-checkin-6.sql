-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 6 — พนักงานยื่นใบลาจากมือถือ
--  ใบลาเข้า "ระบบลางาน" ของแอดมินเป็นสถานะรออนุมัติ แอดมินเลือกสถานะเอง
--  สถานะที่แอดมินเลือกถูกส่งกลับมาให้พนักงานเห็นในมือถือ
-- ============================================================
create table if not exists public.leave_requests (
  id          bigserial primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  user_id     uuid references public.checkin_users(id) on delete set null,
  emp_id      text not null,
  emp_code    text not null,
  emp_name    text not null default '',
  type        text not null check (type in ('sick','personal','vacation','maternity','ordination','unpaid')),
  from_date   date not null,
  to_date     date not null,
  hours       numeric,                      -- ลาเป็นชั่วโมง (ถ้ามี)
  reason      text not null default '',
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  synced      boolean not null default false, -- ดึงเข้าระบบลางานของแอดมินแล้ว
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  check (to_date >= from_date and to_date - from_date <= 90)
);
create index if not exists leave_requests_owner on public.leave_requests(owner_id, created_at desc);
alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon, authenticated;
grant select, delete on public.leave_requests to authenticated;
grant update (status, synced, decided_at) on public.leave_requests to authenticated;
drop policy if exists "leave req read" on public.leave_requests;
create policy "leave req read" on public.leave_requests for select using (auth.uid() = owner_id);
drop policy if exists "leave req update" on public.leave_requests;
create policy "leave req update" on public.leave_requests for update using (auth.uid() = owner_id);
drop policy if exists "leave req delete" on public.leave_requests;
create policy "leave req delete" on public.leave_requests for delete using (auth.uid() = owner_id);

-- พนักงานยื่นใบลา
create or replace function public.checkin_leave_submit(p_token text, p_type text, p_from date, p_to date,
  p_hours numeric default null, p_reason text default '')
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; v_id bigint;
begin
  select cu.* into u from public.checkin_sessions s join public.checkin_users cu on cu.id = s.user_id
    where s.token = p_token and s.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  if p_type not in ('sick','personal','vacation','maternity','ordination','unpaid') then raise exception 'bad_type'; end if;
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

-- ใบลาของตัวเอง (ล่าสุด 30 ใบ)
create or replace function public.checkin_leave_list(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users;
begin
  select cu.* into u from public.checkin_sessions s join public.checkin_users cu on cu.id = s.user_id
    where s.token = p_token and s.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  return coalesce((select json_agg(x) from (
    select id, type, from_date, to_date, hours, reason, status, created_at
    from public.leave_requests where user_id = u.id order by created_at desc limit 30) x), '[]'::json);
end $$;

-- พนักงานยกเลิกใบลาที่ยังรออนุมัติ
create or replace function public.checkin_leave_cancel(p_token text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare u public.checkin_users;
begin
  select cu.* into u from public.checkin_sessions s join public.checkin_users cu on cu.id = s.user_id
    where s.token = p_token and s.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  update public.leave_requests set status = 'cancelled', decided_at = now()
    where id = p_id and user_id = u.id and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
end $$;

revoke all on function public.checkin_leave_submit(text,text,date,date,numeric,text) from public;
revoke all on function public.checkin_leave_list(text) from public;
revoke all on function public.checkin_leave_cancel(text,bigint) from public;
grant execute on function public.checkin_leave_submit(text,text,date,date,numeric,text) to anon, authenticated;
grant execute on function public.checkin_leave_list(text) to anon, authenticated;
grant execute on function public.checkin_leave_cancel(text,bigint) to anon, authenticated;
notify pgrst, 'reload schema';
