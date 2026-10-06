-- ============================================================
--  ลงเวลาผ่านมือถือ (ถ่ายรูป + GPS) — ฟีเจอร์พรีเมี่ยม
--  พนักงานไม่มีบัญชี Supabase: เข้าด้วย รหัสบริษัท + รหัสพนักงาน + PIN
--  ทุกอย่างผ่านฟังก์ชัน security definer เท่านั้น ตารางเปิดให้เจ้าของบริษัทอ่านอย่างเดียว
--  (ต้องรัน supabase-premium-lock.sql ก่อน เพราะใช้ public.is_premium)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) ตั้งค่าของบริษัท ----------------------------------------------------
create table if not exists public.checkin_config (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  code          text not null unique,                 -- รหัสบริษัทที่พนักงานกรอก
  company_name  text not null default '',
  sites         jsonb not null default '[]'::jsonb,   -- [{name,lat,lng,radius}]
  require_zone  boolean not null default true,
  require_photo boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table public.checkin_config enable row level security;
drop policy if exists "checkin config owner" on public.checkin_config;
create policy "checkin config owner" on public.checkin_config
  for all using (auth.uid() = owner_id and public.is_premium())
  with check (auth.uid() = owner_id and public.is_premium() and code ~ '^[A-Z0-9]{6}$');

-- 2) บัญชีลงเวลาของพนักงาน (PIN เก็บแบบ bcrypt) --------------------------
create table if not exists public.checkin_users (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  emp_id       text not null,
  emp_code     text not null,
  emp_name     text not null default '',
  pin_hash     text not null,
  active       boolean not null default true,
  fail_count   int not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  unique (owner_id, emp_code)
);
alter table public.checkin_users enable row level security;
drop policy if exists "checkin users read" on public.checkin_users;
create policy "checkin users read" on public.checkin_users
  for select using (auth.uid() = owner_id);
drop policy if exists "checkin users update" on public.checkin_users;
create policy "checkin users update" on public.checkin_users
  for update using (auth.uid() = owner_id and public.is_premium());
drop policy if exists "checkin users delete" on public.checkin_users;
create policy "checkin users delete" on public.checkin_users
  for delete using (auth.uid() = owner_id);
-- เจ้าของอ่าน pin_hash ไม่ได้ — ให้สิทธิ์อ่านรายคอลัมน์ ยกเว้น pin_hash
revoke all on public.checkin_users from anon, authenticated;
grant select (id, owner_id, emp_id, emp_code, emp_name, active, fail_count, locked_until, created_at)
  on public.checkin_users to authenticated;
grant update (active, emp_name) on public.checkin_users to authenticated;
grant delete on public.checkin_users to authenticated;

-- 3) session ของมือถือพนักงาน — ไม่มีใครอ่านตรงได้ ------------------------
create table if not exists public.checkin_sessions (
  token      text primary key,
  user_id    uuid not null references public.checkin_users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.checkin_sessions enable row level security;
revoke all on public.checkin_sessions from anon, authenticated;

-- 4) บันทึกการลงเวลา -----------------------------------------------------
create table if not exists public.punches (
  id         bigserial primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  user_id    uuid references public.checkin_users(id) on delete set null,
  emp_id     text not null,
  emp_code   text not null,
  emp_name   text not null default '',
  kind       text not null check (kind in ('in','out')),
  ts         timestamptz not null default now(),
  lat        double precision,
  lng        double precision,
  accuracy   real,
  distance_m int,
  site_name  text,
  in_zone    boolean,
  photo      text,                       -- รูปย่อ JPEG (data URL) ลบอัตโนมัติหลัง 90 วัน
  merged     boolean not null default false
);
create index if not exists punches_owner_ts on public.punches(owner_id, ts desc);
alter table public.punches enable row level security;
drop policy if exists "punches read" on public.punches;
create policy "punches read" on public.punches
  for select using (auth.uid() = owner_id and public.is_premium());
drop policy if exists "punches update" on public.punches;
create policy "punches update" on public.punches
  for update using (auth.uid() = owner_id and public.is_premium());
drop policy if exists "punches delete" on public.punches;
create policy "punches delete" on public.punches
  for delete using (auth.uid() = owner_id);

-- ============================================================
--  ฟังก์ชันฝั่งแอดมิน (ต้องล็อกอิน)
-- ============================================================
create or replace function public.checkin_set_user(p_emp_id text, p_emp_code text, p_emp_name text, p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_premium(auth.uid()) then raise exception 'not_premium'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'bad_pin'; end if;
  insert into public.checkin_users(owner_id, emp_id, emp_code, emp_name, pin_hash)
    values (auth.uid(), p_emp_id, upper(trim(p_emp_code)), coalesce(p_emp_name,''), crypt(p_pin, gen_salt('bf')))
  on conflict (owner_id, emp_code) do update
    set emp_id=excluded.emp_id, emp_name=excluded.emp_name, pin_hash=excluded.pin_hash,
        active=true, fail_count=0, locked_until=null
  returning id into v_id;
  delete from public.checkin_sessions where user_id = v_id;   -- เปลี่ยน PIN = เด้งออกจากทุกเครื่อง
  return v_id;
end $$;

-- ============================================================
--  ฟังก์ชันฝั่งพนักงาน (ไม่ต้องล็อกอิน Supabase)
-- ============================================================
create or replace function public.checkin_login(p_code text, p_emp text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c public.checkin_config; u public.checkin_users; v_token text;
begin
  select * into c from public.checkin_config where code = upper(trim(p_code));
  if not found then raise exception 'invalid'; end if;
  select * into u from public.checkin_users where owner_id = c.owner_id and emp_code = upper(trim(p_emp));
  if not found or not u.active then raise exception 'invalid'; end if;
  if u.locked_until is not null and u.locked_until > now() then raise exception 'locked'; end if;
  if u.pin_hash <> crypt(coalesce(p_pin,''), u.pin_hash) then
    update public.checkin_users
      set fail_count = fail_count + 1,
          locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else null end
      where id = u.id;
    -- คืนค่าแทนการ raise — ถ้า raise ธุรกรรมจะถูกย้อน ตัวนับครั้งที่ผิดจะไม่ถูกบันทึก
    return json_build_object('error', 'invalid');
  end if;
  if not public.is_premium(c.owner_id) then raise exception 'not_premium'; end if;
  update public.checkin_users set fail_count = 0, locked_until = null where id = u.id;
  delete from public.checkin_sessions where expires_at < now();
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.checkin_sessions(token, user_id, expires_at) values (v_token, u.id, now() + interval '60 days');
  return json_build_object('token', v_token);
end $$;

create or replace function public.checkin_me(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; c public.checkin_config; last_p record;
begin
  select cu.* into u from public.checkin_sessions s join public.checkin_users cu on cu.id = s.user_id
    where s.token = p_token and s.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  select * into c from public.checkin_config where owner_id = u.owner_id;
  select kind, ts into last_p from public.punches where user_id = u.id order by ts desc limit 1;
  return json_build_object(
    'emp_name', u.emp_name, 'emp_code', u.emp_code, 'company', c.company_name,
    'sites', c.sites, 'require_zone', c.require_zone, 'require_photo', c.require_photo,
    'premium', public.is_premium(u.owner_id),
    'last_kind', last_p.kind, 'last_ts', last_p.ts);
end $$;

create or replace function public.checkin_punch(p_token text, p_kind text, p_lat double precision,
  p_lng double precision, p_acc real, p_photo text)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; c public.checkin_config; s jsonb;
        best_d double precision; best_name text; d double precision; v_in boolean; v_ts timestamptz;
begin
  select cu.* into u from public.checkin_sessions ss join public.checkin_users cu on cu.id = ss.user_id
    where ss.token = p_token and ss.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  if p_kind not in ('in','out') then raise exception 'bad_kind'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  select * into c from public.checkin_config where owner_id = u.owner_id;

  if c.require_photo and (p_photo is null or p_photo !~ '^data:image/jpeg;base64,') then raise exception 'photo_required'; end if;
  if p_photo is not null and length(p_photo) > 250000 then raise exception 'photo_too_big'; end if;

  -- จุดลงเวลาที่ใกล้ที่สุด (สูตร haversine หน่วยเมตร)
  if p_lat is not null and p_lng is not null then
    for s in select * from jsonb_array_elements(coalesce(c.sites,'[]'::jsonb)) loop
      d := 2 * 6371000 * asin(sqrt(
             power(sin(radians(((s->>'lat')::float8 - p_lat) / 2)), 2) +
             cos(radians(p_lat)) * cos(radians((s->>'lat')::float8)) *
             power(sin(radians(((s->>'lng')::float8 - p_lng) / 2)), 2)));
      if d <= coalesce((s->>'radius')::float8, 150) + least(coalesce(p_acc,0), 100) then
        best_d := d; best_name := s->>'name'; v_in := true;   -- อยู่ในจุดนี้ ใช้จุดนี้เลย
        exit;
      end if;
      if best_d is null or d < best_d then best_d := d; best_name := s->>'name'; end if;
    end loop;
    v_in := coalesce(v_in, false);
  end if;
  if c.require_zone and jsonb_array_length(coalesce(c.sites,'[]'::jsonb)) > 0 then
    if p_lat is null then raise exception 'gps_required'; end if;
    if not coalesce(v_in,false) then
      raise exception 'out_of_zone:%', round(best_d)::int;
    end if;
  end if;

  -- กันกดซ้ำภายใน 1 นาที
  if exists (select 1 from public.punches where user_id = u.id and kind = p_kind and ts > now() - interval '1 minute') then
    raise exception 'duplicate';
  end if;

  insert into public.punches(owner_id, user_id, emp_id, emp_code, emp_name, kind, lat, lng, accuracy,
                             distance_m, site_name, in_zone, photo)
    values (u.owner_id, u.id, u.emp_id, u.emp_code, u.emp_name, p_kind, p_lat, p_lng, p_acc,
            round(best_d)::int, best_name, v_in, p_photo)
    returning ts into v_ts;

  -- ลบรูปเก่าเกิน 90 วันของบริษัทนี้ (PDPA — เก็บเท่าที่จำเป็น)
  update public.punches set photo = null
    where owner_id = u.owner_id and photo is not null and ts < now() - interval '90 days';

  return json_build_object('ts', v_ts, 'kind', p_kind, 'distance_m', round(best_d)::int,
                           'site', best_name, 'in_zone', v_in);
end $$;

create or replace function public.checkin_logout(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.checkin_sessions where token = p_token;
$$;

-- สิทธิ์ตาราง: anon เข้าตรงไม่ได้เลย ต้องผ่านฟังก์ชันด้านล่าง
revoke all on public.checkin_config from anon;
revoke all on public.punches from anon, authenticated;
grant select, delete on public.punches to authenticated;
grant update (merged) on public.punches to authenticated;

-- สิทธิ์เรียกใช้
revoke all on function public.checkin_set_user(text,text,text,text) from public, anon;
grant execute on function public.checkin_set_user(text,text,text,text) to authenticated;
revoke all on function public.checkin_login(text,text,text) from public;
revoke all on function public.checkin_me(text) from public;
revoke all on function public.checkin_punch(text,text,double precision,double precision,real,text) from public;
revoke all on function public.checkin_logout(text) from public;
grant execute on function public.checkin_login(text,text,text) to anon, authenticated;
grant execute on function public.checkin_me(text) to anon, authenticated;
grant execute on function public.checkin_punch(text,text,double precision,double precision,real,text) to anon, authenticated;
grant execute on function public.checkin_logout(text) to anon, authenticated;
