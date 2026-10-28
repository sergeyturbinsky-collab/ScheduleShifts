-- ===== (2026-10-28, סרגיי: "כשעושים ניקוי של שיבוץ אוטומטי, לא לנקות את מה שהוזן ידנית")
-- 1) rpc_assignment_set שומר את סוג השיבוץ (ידני/אוטומטי) של עובד שכבר היה במשבצת - רק עובד חדש מקבל את p_method.
--    עד עכשיו כל שמירה של משבצת סימנה את כל העובדים בה באותו סוג, ולכן לא היה אפשר לדעת מה הוזן ידנית.
-- 2) rpc_schedule_clear_auto - ניקוי שמוחק רק שיבוצים אוטומטיים. שיבוצים ידניים ומשימות נשארים.
-- להרצה ב-SQL Editor של Supabase (הפרויקט החי). =====
create or replace function public.rpc_assignment_set(p_pin text, p_sector text, p_entry_date date, p_shift_type text, p_worker_ids uuid[], p_method text DEFAULT 'manual'::text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare wid uuid; result jsonb; v_prev jsonb;
begin
  if not public.verify_edit_pin(p_pin) then
    raise exception 'invalid pin' using errcode = '28000';
  end if;
  perform public.pin_require_sector(p_pin, p_sector);

  select coalesce(jsonb_object_agg(worker_id::text, method), '{}'::jsonb) into v_prev
    from public.shift_assignments where sector = p_sector and entry_date = p_entry_date and shift_type = p_shift_type;

  delete from public.shift_assignments
   where sector = p_sector and entry_date = p_entry_date and shift_type = p_shift_type;

  if p_worker_ids is not null then
    foreach wid in array p_worker_ids loop
      insert into public.shift_assignments (sector, entry_date, shift_type, worker_id, team_id, method)
      values (p_sector, p_entry_date, p_shift_type, wid,
        (select team_id from public.roster_workers where id = wid),
        coalesce(v_prev->>(wid::text), p_method, 'manual'))
      on conflict (sector, entry_date, shift_type, worker_id) do nothing;
    end loop;
  end if;

  select jsonb_agg(to_jsonb(a.*)) into result
    from public.shift_assignments a
   where a.sector = p_sector and a.entry_date = p_entry_date and a.shift_type = p_shift_type;
  return coalesce(result, '[]'::jsonb);
end; $function$;

create or replace function public.rpc_schedule_clear_auto(p_pin text, p_sectors text[], p_from date, p_to date)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n int; r record; v_actor text := public.pin_actor_name(p_pin);
begin
  if not public.verify_edit_pin(p_pin) then raise exception 'invalid pin' using errcode = '28000'; end if;
  perform public.pin_require_sectors(p_pin, p_sectors);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then raise exception 'טווח לא תקין'; end if;
  for r in select a.sector, a.entry_date, a.shift_type, a.worker_id, w.name from public.shift_assignments a left join public.roster_workers w on w.id = a.worker_id
            where a.sector = any(p_sectors) and a.entry_date between p_from and p_to and a.method = 'auto' loop
    insert into public.schedule_change_log (sector, entry_date, shift_type, actor, kind, worker_id, worker_name, detail, auto)
    values (r.sector, r.entry_date, r.shift_type, v_actor, 'remove', r.worker_id, r.name, 'הוסר בניקוי השיבוץ האוטומטי', false);
  end loop;
  delete from public.shift_assignments where sector = any(p_sectors) and entry_date between p_from and p_to and method = 'auto';
  get diagnostics n = row_count;
  -- חפיפה (חניך) שהמארח שלה נמחק - נשארת ללא מארח
  update public.shift_assignments s set shadow_of = null
   where s.sector = any(p_sectors) and s.entry_date between p_from and p_to and s.shadow_of is not null
     and not exists(select 1 from public.shift_assignments h where h.sector = s.sector and h.entry_date = s.entry_date and h.shift_type = s.shift_type and h.worker_id = s.shadow_of);
  return n;
end; $function$;
revoke all on function public.rpc_schedule_clear_auto(text,text[],date,date) from public;
grant execute on function public.rpc_schedule_clear_auto(text,text[],date,date) to anon, authenticated;

select 'עודכן' as status;
