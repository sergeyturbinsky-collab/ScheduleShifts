-- ===== (2026-10-25, סרגיי: "תחסום, שמעבר לעובד הרלוונטי רק לקב"ט, סרגיי ומנהל היחידה תהיה גישה")
-- משימות שאינן משמרת: השרת מחזיר רק למי שמורשה. עובד - רק המשימות שלו. קב"ט - הגזרות שלו. סרגיי / מנהל היחידה - הכל.
-- עורכי סידור (קוד העריכה / עובד עם הרשאת עריכת סידור) - הכל, כמו היום. בלי הזדהות - כלום.
-- לא משנה ולא מוחק שום משימה. =====
create or replace function public.sched_tasks_list_v2(p_sectors text[], p_from date, p_to date, p_auth text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_worker uuid; v_mgr uuid; v_all boolean := false; v_secs text[];
begin
  if coalesce(p_auth, '') = '' then return '[]'::jsonb; end if;
  if p_auth like 'wtok:%' then
    select s.worker_id into v_worker from public.worker_sessions s where s.token = substr(p_auth, 6) and s.expires_at > now();
    if v_worker is null then return '[]'::jsonb; end if;
  elsif p_auth like 'mgr:%' then
    select s.manager_id into v_mgr from public.manager_sessions s where s.token = substr(p_auth, 5) and s.expires_at > now();
    if v_mgr is null then return '[]'::jsonb; end if;
    if exists(select 1 from public.managers m where m.id = v_mgr and m.is_admin) or exists(select 1 from public.unit_managers u where u.manager_id = v_mgr) then
      v_all := true;
    else
      select coalesce(array_agg(distinct x), '{}') into v_secs from unnest(public.mgr_scope_team_ids(v_mgr)) tid, unnest(public.team_sched_sectors(tid)) x;
    end if;
  elsif public.verify_edit_pin(p_auth) then
    v_all := true; -- קוד העריכה המשותף / עובד עורך סידור (wrk:)
  else
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'sector', t.sector, 'date', t.entry_date, 'slot', t.slot,
           'worker_id', t.worker_id, 'worker_name', w.name, 'title', t.title, 'start', t.start_time, 'end', t.end_time,
           'series_id', t.series_id,
           'series_from', (select min(x.entry_date) from public.schedule_tasks x where t.series_id is not null and x.series_id = t.series_id and x.removed_at is null),
           'series_to', (select max(x.entry_date) from public.schedule_tasks x where t.series_id is not null and x.series_id = t.series_id and x.removed_at is null))
           order by t.entry_date, t.slot)
    from public.schedule_tasks t left join public.roster_workers w on w.id = t.worker_id
   where t.removed_at is null and t.sector = any(p_sectors) and t.entry_date between p_from and p_to
     and (v_all or (v_worker is not null and t.worker_id = v_worker) or (v_secs is not null and t.sector = any(v_secs)))), '[]'::jsonb);
end; $function$;
revoke all on function public.sched_tasks_list_v2(text[],date,date,text) from public;
grant execute on function public.sched_tasks_list_v2(text[],date,date,text) to anon, authenticated;

-- הגרסה הישנה (בלי הזדהות) כבר לא מחזירה משימות. טלפון עם גרסה ישנה מתעדכן לבד בפתיחה הבאה.
create or replace function public.sched_tasks_list(p_sectors text[], p_from date, p_to date)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$ select '[]'::jsonb $function$;

select 'עודכן' as status;
