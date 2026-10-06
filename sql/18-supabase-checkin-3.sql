-- ============================================================
--  ลงเวลาผ่านมือถือ รอบ 3 — จดจำใบหน้า
--  (รันหลัง supabase-checkin.sql และ supabase-checkin-2.sql)
--  • มือถือแปลงใบหน้าเป็นตัวเลข 128 ค่า (face descriptor) ส่งมาพร้อมการลงเวลา
--  • ครั้งแรก = ลงทะเบียนใบหน้า (ต้องกดยินยอมก่อน — ข้อมูลชีวภาพ PDPA ม.26)
--  • ครั้งต่อไป เทียบกับใบหน้าที่ลงทะเบียนไว้ ถ้าไม่ใช่คนเดิม = ลงเวลาไม่ได้
--  • ตัวเลขใบหน้าไม่ถูกส่งกลับไปที่มือถือหรือหน้าแอดมิน
-- ============================================================

alter table public.checkin_users  add column if not exists face_desc        float8[];
alter table public.checkin_users  add column if not exists face_photo       text;
alter table public.checkin_users  add column if not exists face_enrolled_at timestamptz;
alter table public.checkin_users  add column if not exists face_consent_at  timestamptz;
alter table public.checkin_config add column if not exists require_face     boolean not null default true;
alter table public.checkin_config add column if not exists face_threshold   real    not null default 0.5;
alter table public.punches        add column if not exists face_dist        real;

-- แอดมินเห็นรูปตอนลงทะเบียนและวันที่ แต่ไม่เห็นตัวเลขใบหน้า
grant select (face_photo, face_enrolled_at, face_consent_at) on public.checkin_users to authenticated;

-- ระยะห่างระหว่างใบหน้า (Euclidean) — ยิ่งน้อยยิ่งเหมือน
create or replace function public.face_distance(a float8[], b float8[])
returns float8 language sql immutable as $$
  select sqrt(sum(power(x.v - y.v, 2)))
  from unnest(a) with ordinality as x(v, i)
  join unnest(b) with ordinality as y(v, i) using (i);
$$;

-- แอดมินล้างใบหน้าของพนักงาน (ให้ลงทะเบียนใหม่ครั้งถัดไป)
create or replace function public.checkin_reset_face(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.checkin_users
    set face_desc = null, face_photo = null, face_enrolled_at = null, face_consent_at = null
    where id = p_user_id and owner_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
end $$;
revoke all on function public.checkin_reset_face(uuid) from public, anon;
grant execute on function public.checkin_reset_face(uuid) to authenticated;

-- ข้อมูลของพนักงาน + บอกว่าลงทะเบียนใบหน้าแล้วหรือยัง
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
    'require_face', c.require_face, 'face_enrolled', u.face_desc is not null,
    'premium', public.is_premium(u.owner_id),
    'last_kind', last_p.kind, 'last_ts', last_p.ts);
end $$;

-- ลงเวลา (เวอร์ชันใหม่ รับตัวเลขใบหน้า + การยินยอม)
drop function if exists public.checkin_punch(text,text,double precision,double precision,real,text);
create or replace function public.checkin_punch(p_token text, p_kind text, p_lat double precision,
  p_lng double precision, p_acc real, p_photo text, p_desc float8[] default null, p_consent boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; c public.checkin_config; s jsonb;
        best_d double precision; best_name text; d double precision; v_in boolean; v_ts timestamptz;
        v_fd real; v_enrolled boolean := false;
begin
  select cu.* into u from public.checkin_sessions ss join public.checkin_users cu on cu.id = ss.user_id
    where ss.token = p_token and ss.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  if p_kind not in ('in','out') then raise exception 'bad_kind'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  select * into c from public.checkin_config where owner_id = u.owner_id;

  if c.require_photo and (p_photo is null or p_photo !~ '^data:image/jpeg;base64,') then raise exception 'photo_required'; end if;
  if p_photo is not null and length(p_photo) > 250000 then raise exception 'photo_too_big'; end if;

  -- ใบหน้า
  if p_desc is not null and array_length(p_desc, 1) <> 128 then raise exception 'bad_face'; end if;
  if c.require_face then
    if p_desc is null then raise exception 'face_required'; end if;
    if u.face_desc is null then
      if not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
      update public.checkin_users
        set face_desc = p_desc, face_photo = p_photo, face_enrolled_at = now(), face_consent_at = now()
        where id = u.id;
      v_enrolled := true; v_fd := 0;
    else
      v_fd := public.face_distance(u.face_desc, p_desc);
      if v_fd > coalesce(c.face_threshold, 0.5) then
        raise exception 'face_mismatch:%', round(v_fd::numeric, 2);
      end if;
    end if;
  elsif p_desc is not null and u.face_desc is not null then
    v_fd := public.face_distance(u.face_desc, p_desc);   -- ไม่บังคับ แต่เก็บค่าไว้ให้แอดมินดู
  end if;

  -- จุดลงเวลา (haversine หน่วยเมตร)
  if p_lat is not null and p_lng is not null then
    for s in select * from jsonb_array_elements(coalesce(c.sites,'[]'::jsonb)) loop
      d := 2 * 6371000 * asin(sqrt(
             power(sin(radians(((s->>'lat')::float8 - p_lat) / 2)), 2) +
             cos(radians(p_lat)) * cos(radians((s->>'lat')::float8)) *
             power(sin(radians(((s->>'lng')::float8 - p_lng) / 2)), 2)));
      if d <= coalesce((s->>'radius')::float8, 150) + least(coalesce(p_acc,0), 100) then
        best_d := d; best_name := s->>'name'; v_in := true;
        exit;
      end if;
      if best_d is null or d < best_d then best_d := d; best_name := s->>'name'; end if;
    end loop;
    v_in := coalesce(v_in, false);
  end if;
  if c.require_zone and jsonb_array_length(coalesce(c.sites,'[]'::jsonb)) > 0 then
    if p_lat is null then raise exception 'gps_required'; end if;
    if not coalesce(v_in,false) then raise exception 'out_of_zone:%', round(best_d)::int; end if;
  end if;

  if exists (select 1 from public.punches where user_id = u.id and kind = p_kind and ts > now() - interval '1 minute') then
    raise exception 'duplicate';
  end if;

  insert into public.punches(owner_id, user_id, emp_id, emp_code, emp_name, kind, lat, lng, accuracy,
                             distance_m, site_name, in_zone, photo, face_dist)
    values (u.owner_id, u.id, u.emp_id, u.emp_code, u.emp_name, p_kind, p_lat, p_lng, p_acc,
            round(best_d)::int, best_name, v_in, p_photo, v_fd)
    returning ts into v_ts;

  update public.punches set photo = null
    where owner_id = u.owner_id and photo is not null and ts < now() - interval '90 days';

  return json_build_object('ts', v_ts, 'kind', p_kind, 'distance_m', round(best_d)::int,
                           'site', best_name, 'in_zone', v_in, 'enrolled', v_enrolled, 'face_dist', v_fd);
end $$;

revoke all on function public.checkin_punch(text,text,double precision,double precision,real,text,float8[],boolean) from public;
grant execute on function public.checkin_punch(text,text,double precision,double precision,real,text,float8[],boolean) to anon, authenticated;
notify pgrst, 'reload schema';
