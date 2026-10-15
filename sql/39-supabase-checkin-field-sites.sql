-- 39) ลงเวลาผ่านมือถือ — หมุดนอกสถานที่ / หลายสาขา กำหนดสิทธิ์รายคนและช่วงวันที่ได้
-- รันหลัง 35 · รันซ้ำได้
-- checkin_config.sites = [หมุดบริษัท, หมุดอื่น ๆ ...] แต่ละหมุดมีได้:
--   emps: ["emp_id", ...]  เฉพาะคนเหล่านี้สแกนที่หมุดนี้ได้ (ว่าง/ไม่มี = ทุกคน เช่นสาขา)
--   from / to: "YYYY-MM-DD" ใช้ได้เฉพาะช่วงวันนี้ (ว่าง = ไม่จำกัด)
-- ฟังก์ชัน checkin_punch เหมือนไฟล์ 35 ทุกอย่าง เพิ่มแค่ 3 บรรทัดกรองหมุดในลูปตรวจพื้นที่

-- ฟังก์ชันด้านล่างต่อยอดจากไฟล์ 35 (รูปใน Storage) — ยังไม่ได้รัน 35 ให้หยุดตรงนี้
do $chk$ begin
  if to_regclass('public.checkin_photo_tickets') is null then
    raise exception 'ต้องรันไฟล์ 35-supabase-checkin-photo-storage.sql ก่อน แล้วค่อยรันไฟล์นี้';
  end if;
end $chk$;

-- ตัวบอกแอปว่ารันไฟล์นี้แล้ว (แอปเปิดให้เพิ่มหมุดนอกสถานที่ก็ต่อเมื่อมีคอลัมน์นี้)
alter table public.checkin_config add column if not exists field_sites boolean not null default true;

create or replace function public.checkin_punch(p_token text, p_kind text, p_lat double precision,
  p_lng double precision, p_acc real, p_photo text, p_desc float8[] default null, p_consent boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; c public.checkin_config; s jsonb;
        best_d double precision; best_name text; d double precision; v_in boolean; v_ts timestamptz;
        v_fd real; v_enrolled boolean := false; v_path text;
begin
  select cu.* into u from public.checkin_sessions ss join public.checkin_users cu on cu.id = ss.user_id
    where ss.token = p_token and ss.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  if p_kind not in ('in','out') then raise exception 'bad_kind'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  select * into c from public.checkin_config where owner_id = u.owner_id;

  -- รูปใน Storage: ต้องเป็นตั๋วของพนักงานคนนี้ ยังไม่ถูกใช้ และอัปโหลดไฟล์ขึ้นไปแล้วจริง
  if p_photo like 'sb:%' then
    v_path := substring(p_photo from 4);
    if not exists (select 1 from public.checkin_photo_tickets t
                    where t.path = v_path and t.user_id = u.id and not t.used and t.expires_at > now())
       or not exists (select 1 from storage.objects o where o.bucket_id = 'punch-photos' and o.name = v_path)
    then raise exception 'photo_required'; end if;
    update public.checkin_photo_tickets set used = true where path = v_path;
  elsif c.require_photo and (p_photo is null or p_photo !~ '^data:image/jpeg;base64,') then
    raise exception 'photo_required';
  end if;
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
      -- หมุดนอกสถานที่: เฉพาะคนที่กำหนด (emps ว่าง = ทุกคน) และเฉพาะช่วงวันที่ (from/to ว่าง = ไม่จำกัด)
      if jsonb_typeof(s->'emps') = 'array' and jsonb_array_length(s->'emps') > 0 and not ((s->'emps') ? u.emp_id) then continue; end if;
      if coalesce(s->>'from','') ~ '^\d{4}-\d{2}-\d{2}$' and (now() at time zone 'Asia/Bangkok')::date < (s->>'from')::date then continue; end if;
      if coalesce(s->>'to','')   ~ '^\d{4}-\d{2}-\d{2}$' and (now() at time zone 'Asia/Bangkok')::date > (s->>'to')::date then continue; end if;
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

-- ตรวจผล — ต้องได้ true ทุกบรรทัด
select 'มีคอลัมน์ field_sites' as item, exists(select 1 from information_schema.columns where table_schema='public' and table_name='checkin_config' and column_name='field_sites') as ok
union all select 'ฟังก์ชันสแกนกรองหมุดรายคน', pg_get_functiondef('public.checkin_punch(text,text,double precision,double precision,real,text,float8[],boolean)'::regprocedure) like '%emps%';
