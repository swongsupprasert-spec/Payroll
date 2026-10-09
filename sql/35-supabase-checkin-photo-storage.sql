-- ============================================================
--  ย้ายรูปเซลฟี่ลงเวลาไปเก็บใน Supabase Storage (bucket "punch-photos")
--
--  เดิม: รูปเก็บเป็นข้อความ (data URL) ในตาราง punches → ฐานข้อมูล 500 MB เต็มเร็ว
--  ใหม่: รูปเก็บเป็นไฟล์ JPEG ใน Storage (โควตาแยก 1 GB) ตาราง punches เก็บแค่ที่อยู่ไฟล์ "sb:<path>"
--
--  พนักงานไม่ได้ล็อกอิน Supabase → ใช้ "ตั๋วอัปโหลด" ใช้ครั้งเดียว อายุ 10 นาที
--    1) มือถือขอตั๋วด้วย token ลงเวลา (checkin_photo_ticket) → ได้ที่อยู่ไฟล์ที่อนุญาต 1 ไฟล์
--    2) อัปโหลดไฟล์ได้เฉพาะที่อยู่นั้น (นโยบาย Storage ตรวจตั๋ว)
--    3) checkin_punch รับ "sb:<path>" ตรวจว่าเป็นตั๋วของพนักงานคนนี้ แล้วปิดตั๋ว
--  ที่อยู่ไฟล์: <owner_id>/<YYYY-MM-DD>/<ตั๋ว>.jpg  ·  รูปลงทะเบียนใบหน้า: <owner_id>/face/<user_id>/<ตั๋ว>.jpg
--  เจ้าของบริษัท (และผู้ดูแลระบบ) ดู/ลบรูปของบริษัทตัวเองได้ · รูปเกิน 90 วันแอปลบให้ตอนเปิดหน้าลงเวลา
--  รูปเก่าที่เป็น data URL ยังแสดงได้ตามเดิม และหมดอายุเองใน 90 วัน
--  (ต้องรันหลัง 18 และ 27)
-- ============================================================

-- 1) bucket ส่วนตัว รับเฉพาะ JPEG ไม่เกิน 300 KB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('punch-photos', 'punch-photos', false, 300000, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 300000, allowed_mime_types = array['image/jpeg'];

-- 2) ตั๋วอัปโหลด
create table if not exists public.checkin_photo_tickets (
  path       text primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  user_id    uuid not null references public.checkin_users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used       boolean not null default false
);
alter table public.checkin_photo_tickets enable row level security;   -- ไม่มี policy = เข้าได้ผ่านฟังก์ชันด้านล่างเท่านั้น
revoke all on public.checkin_photo_tickets from anon, authenticated;

create or replace function public.checkin_photo_ticket(p_token text, p_face boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare u public.checkin_users; p text;
begin
  select cu.* into u from public.checkin_sessions ss join public.checkin_users cu on cu.id = ss.user_id
    where ss.token = p_token and ss.expires_at > now() and cu.active;
  if not found then raise exception 'session'; end if;
  if not public.is_premium(u.owner_id) then raise exception 'not_premium'; end if;
  delete from public.checkin_photo_tickets where expires_at < now() - interval '1 day';   -- เก็บกวาดตั๋วเก่า
  p := u.owner_id || '/' ||
       case when p_face then 'face/' || u.id else to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD') end ||
       '/' || replace(gen_random_uuid()::text, '-', '') || '.jpg';
  insert into public.checkin_photo_tickets(path, owner_id, user_id) values (p, u.owner_id, u.id);
  return p;
end $$;
revoke all on function public.checkin_photo_ticket(text, boolean) from public;
grant execute on function public.checkin_photo_ticket(text, boolean) to anon, authenticated;

-- ใช้ในนโยบาย Storage: อัปโหลดได้เฉพาะที่อยู่ที่มีตั๋วยังไม่หมดอายุและยังไม่ถูกใช้
create or replace function public.checkin_photo_ticket_ok(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.checkin_photo_tickets where path = p_path and not used and expires_at > now());
$$;
revoke all on function public.checkin_photo_ticket_ok(text) from public;
grant execute on function public.checkin_photo_ticket_ok(text) to anon, authenticated;

-- 3) นโยบาย Storage
drop policy if exists "punch photos: upload with ticket" on storage.objects;
create policy "punch photos: upload with ticket" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'punch-photos' and public.checkin_photo_ticket_ok(name));

drop policy if exists "punch photos: owner read" on storage.objects;
create policy "punch photos: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'punch-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "punch photos: owner delete" on storage.objects;
create policy "punch photos: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'punch-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- 4) checkin_punch: รับรูปได้ทั้ง data URL (แอปรุ่นเก่า) และ "sb:<path>" (อัปโหลดเข้า Storage แล้ว)
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
select 'มี bucket punch-photos (ส่วนตัว)' as item, exists(select 1 from storage.buckets where id='punch-photos' and not public) as ok
union all select 'มีนโยบายอัปโหลดด้วยตั๋ว', exists(select 1 from pg_policies where schemaname='storage' and policyname='punch photos: upload with ticket')
union all select 'มีนโยบายให้เจ้าของดูรูป', exists(select 1 from pg_policies where schemaname='storage' and policyname='punch photos: owner read')
union all select 'มีฟังก์ชันออกตั๋ว', exists(select 1 from pg_proc where proname='checkin_photo_ticket');
