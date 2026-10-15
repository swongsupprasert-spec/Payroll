-- 38) ลงเวลาผ่านมือถือ — กันสแกนเข้างานเร็วเกิน (กันมาสแกนก่อนแล้วออกไป)
-- รันหลัง 16, 18, 23 · รันซ้ำได้
--
-- checkin_config.early_in_min  = สแกน "เข้างาน" ได้ก่อนเวลาเข้ากะไม่เกินกี่นาที (0 = ไม่จำกัด)
-- checkin_users.shift_plan     = เวลากะของพนักงาน แอปเงินเดือนส่งขึ้นมาให้เอง (ล่วงหน้า ~5 สัปดาห์)
--   {"d":"08:00-17:00", "x":{"2026-10-20":"22:00-06:00", "2026-10-25":"off"}}
--   d = กะประจำ · x = วันที่กะไม่เหมือนปกติ ("off" = วันหยุด ไม่จำกัดเวลา)
-- ยังไม่มี shift_plan / ตั้ง 0 นาที = สแกนได้ทุกเวลาเหมือนเดิม

alter table public.checkin_config add column if not exists early_in_min int not null default 0;
alter table public.checkin_users  add column if not exists shift_plan  jsonb;

grant select (shift_plan) on public.checkin_users to authenticated;
grant update (shift_plan) on public.checkin_users to authenticated;

create or replace function public.checkin_block_early_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_min int; v_plan jsonb; v_now timestamp; v_day date; v_s text; v_p text; v_st timestamp; v_pe timestamp;
begin
  if new.kind <> 'in' then return new; end if;
  select early_in_min into v_min from public.checkin_config where owner_id = new.owner_id;
  if coalesce(v_min, 0) <= 0 then return new; end if;
  select shift_plan into v_plan from public.checkin_users where id = new.user_id;
  if v_plan is null then return new; end if;

  v_now := coalesce(new.ts, now()) at time zone 'Asia/Bangkok';
  v_day := v_now::date;
  v_s := coalesce(v_plan->'x'->>to_char(v_day, 'YYYY-MM-DD'), v_plan->>'d');
  if v_s is null or v_s !~ '^\d{1,2}:\d{2}-\d{1,2}:\d{2}$' then return new; end if;   -- วันหยุด / ไม่มีกะ

  -- ยังอยู่ในกะข้ามคืนของเมื่อวาน (เช่นกะ 22:00-06:00 มาสายถึงตี 1) = ไม่ใช่การสแกนก่อนเวลา
  v_p := coalesce(v_plan->'x'->>to_char(v_day - 1, 'YYYY-MM-DD'), v_plan->>'d');
  if v_p ~ '^\d{1,2}:\d{2}-\d{1,2}:\d{2}$' and split_part(v_p, '-', 2)::time <= split_part(v_p, '-', 1)::time then
    v_pe := v_day + split_part(v_p, '-', 2)::time;
    if v_now < v_pe then return new; end if;
  end if;

  v_st := v_day + split_part(v_s, '-', 1)::time;
  if v_now < v_st - make_interval(mins => v_min) then
    raise exception 'too_early:%', to_char(v_st - make_interval(mins => v_min), 'HH24:MI');
  end if;
  return new;
end $$;

drop trigger if exists punches_block_early_in on public.punches;
create trigger punches_block_early_in before insert on public.punches
  for each row execute function public.checkin_block_early_in();

notify pgrst, 'reload schema';

-- ตรวจผล — ต้องได้ true ทุกบรรทัด
select 'มีคอลัมน์ early_in_min' as item, exists(select 1 from information_schema.columns where table_schema='public' and table_name='checkin_config' and column_name='early_in_min') as ok
union all select 'มีคอลัมน์ shift_plan', exists(select 1 from information_schema.columns where table_schema='public' and table_name='checkin_users' and column_name='shift_plan')
union all select 'มี trigger กันสแกนเร็วเกิน', exists(select 1 from pg_trigger where tgname='punches_block_early_in');
