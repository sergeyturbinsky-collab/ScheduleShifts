-- ===== (2026-10-29, עדכון אבטחה מהמוקד: "שאף מידע רגיש לא ייצא מהשרת בלי זיהוי")
-- שלב א: (1) פונקציות הייצוא/ההפרדה - רק לשרת (service_role), לא מהאתר. (2) גרסאות מוגנות (עם זיהוי) לפונקציות
-- הקריאה שעבדו בלי זיהוי. (3) app_get - קריאה מוגנת של הטבלאות שהאתר קרא ישירות (במקום קריאה ציבורית).
-- שום מידע לא נמחק ולא משתנה. סגירת הקריאה הישירה מהטבלאות - בקובץ נפרד, אחרי שהאתר עבר ל-app_get.

-- (1) ייצוא / הפרדה / דמו - לא נקראים מהאתר. נשארים זמינים רק ל-service_role (SQL Editor / שרת)
revoke all on function public.ops_export_since(text, timestamptz) from public, anon, authenticated;
revoke all on function public.ops_export_script(text, text) from public, anon, authenticated;
revoke all on function public.bridge_ref_export(text) from public, anon, authenticated;
revoke all on function public.demo_export(text) from public, anon, authenticated;
revoke all on function public.sched_tasks_list(text[], date, date) from public, anon, authenticated; -- ישנה (מחזירה ריק), הוחלפה ב-v2

-- זיהוי: מחזיר 'staff' (מנהל / עובד עורך סידור / קוד עריכה / קוד צוות), 'worker' (עובד מחובר) או null.
-- p_auths = רשימת זיהויים מהדפדפן; קודם סשנים אישיים (בלי תופעות לוואי), ורק אם אין - קוד עריכה/קוד צוות (עם מונה הנעילה הקיים).
create or replace function public.app_auth(p_auths jsonb)
 returns table(kind text, worker_id uuid)
 language plpgsql security definer set search_path to 'public'
as $function$
declare a text; v_w uuid; v_ed boolean; v_team uuid; v_code text;
begin
  for a in select jsonb_array_elements_text(coalesce(p_auths, '[]'::jsonb)) loop
    if a like 'mgr:%' then
      if exists(select 1 from public.manager_sessions s where s.token = substr(a, 5) and s.expires_at > now()) then
        kind := 'staff'; worker_id := null; return next; return; end if;
    elsif a like 'wrk:%' or a like 'wtok:%' then
      select s.worker_id, coalesce(r.schedule_editor, false) into v_w, v_ed
        from public.worker_sessions s join public.roster_workers r on r.id = s.worker_id
       where s.token = substr(a, case when a like 'wrk:%' then 5 else 6 end) and s.expires_at > now();
      if v_w is not null then
        kind := case when v_ed then 'staff' else 'worker' end; worker_id := v_w; return next; return; end if;
    end if;
  end loop;
  for a in select jsonb_array_elements_text(coalesce(p_auths, '[]'::jsonb)) loop
    if a like 'team:%' then
      begin
        v_team := split_part(a, ':', 2)::uuid; v_code := substr(a, length('team:') + length(split_part(a, ':', 2)) + 2);
        if public.verify_team_code(v_team, v_code) then kind := 'staff'; worker_id := null; return next; return; end if;
      exception when others then null; end;
    elsif a not like 'mgr:%' and a not like 'wrk:%' and a not like 'wtok:%' and coalesce(a, '') <> '' then
      begin
        if public.verify_edit_pin(a) then kind := 'staff'; worker_id := null; return next; return; end if;
      exception when others then null; end;
    end if;
  end loop;
  return;
end; $function$;
revoke all on function public.app_auth(jsonb) from public, anon, authenticated;

-- קריאה מוגנת מהטבלאות שהאתר קרא ישירות. p_params = זוגות [מפתח, ערך] כמו בכתובת PostgREST:
-- select=..., עמודה=eq./neq./gt./gte./lt./lte./in.(...)/is.null, order=עמודה.asc|desc, limit, offset
create or replace function public.app_get(p_auths jsonb, p_table text, p_params jsonb)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_kind text; v_wid uuid; allowed text[]; p jsonb; k text; v text; op text; val text; c text; dir text;
  sel text[] := '{}'; conds text[] := '{}'; ords text[] := '{}'; lim int; off int; items text[]; it text; res jsonb;
  anon_ok text[] := array['constraint_teams','shift_quotas','schedule_publications'];
begin
  -- אפליקציית המוקד (צפי למשמרת): 'moked:<token>' מ-moked_sessions - רק 4 הטבלאות שהיא צריכה
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_auths, '[]'::jsonb)) x
             where x like 'moked:%' and exists(select 1 from public.moked_sessions s where s.token = substr(x, 7) and s.expires_at > now())) then
    v_kind := 'moked';
    if p_table not in ('shift_assignments','shift_quotas','schedule_publications','constraint_teams') then raise exception 'נדרשת התחברות' using errcode = '28000'; end if;
  else
    select a.kind, a.worker_id into v_kind, v_wid from public.app_auth(p_auths) a;
  end if;
  allowed := case p_table
    when 'shift_assignments' then array['id','sector','entry_date','shift_type','worker_id','team_id','method','created_at','custom_start','custom_end','shadow_of','filled_role','split']
    when 'constraint_entries' then array['id','submission_id','shift_type','custom_start','custom_end','entry_date']
    when 'constraint_submissions' then array['id','team_id','worker_name','period_start','note','created_at','updated_at','worker_id']
    when 'constraint_exceptions' then array['id','worker_id','period_start','created_at']
    when 'shift_quotas' then array['id','sector','day_type','shift_type','label','start_time','end_time','required_count','sort_order','weekday','role_counts']
    when 'schedule_publications' then array['sector','period_start','period_end','published_at','published_by']
    when 'constraint_teams' then array['id','name','sectors','cadence','sort_order','open_weekday','open_time','close_weekday','close_time','has_coordinated_shift','blocking_from','max_blocked_per_week','sub_reminders']
    when 'logistics_items' then array['id','name','has_size','sort_order','size_options','has_serial','has_vehicle']
    else null end;
  if allowed is null then raise exception 'טבלה לא מורשית' using errcode = '42501'; end if;
  allowed := array(select x from unnest(allowed) x where exists(select 1 from pg_attribute t where t.attrelid = ('public.' || p_table)::regclass and t.attname = x and not t.attisdropped));
  if v_kind is null then
    if not (p_table = any(anon_ok)) then raise exception 'נדרשת התחברות' using errcode = '28000'; end if;
    if p_table = 'schedule_publications' then allowed := array['sector','period_start','period_end','published_at']; end if;
  end if;

  for p in select jsonb_array_elements(coalesce(p_params, '[]'::jsonb)) loop
    k := p->>0; v := p->>1;
    if k = 'select' then
      foreach it in array string_to_array(v, ',') loop
        it := btrim(it);
        if it = '*' then sel := sel || allowed;
        elsif it = any(allowed) then sel := sel || it;
        else raise exception 'עמודה לא מורשית: %', it using errcode = '42501'; end if;
      end loop;
    elsif k = 'order' then
      foreach it in array string_to_array(v, ',') loop
        c := split_part(it, '.', 1); dir := lower(coalesce(nullif(split_part(it, '.', 2), ''), 'asc'));
        if not (c = any(allowed)) or dir not in ('asc','desc') then raise exception 'מיון לא תקין' using errcode = '22023'; end if;
        ords := ords || format('%I %s', c, dir);
      end loop;
    elsif k = 'limit' then lim := least(greatest(v::int, 0), 5000);
    elsif k = 'offset' then off := greatest(v::int, 0);
    else
      if not (k = any(allowed)) then raise exception 'עמודה לא מורשית: %', k using errcode = '42501'; end if;
      op := split_part(v, '.', 1); val := substr(v, length(op) + 2);
      if op = 'in' then
        val := regexp_replace(val, '^\((.*)\)$', '\1');
        items := '{}';
        foreach it in array string_to_array(val, ',') loop items := items || format('%L', regexp_replace(btrim(it), '^"(.*)"$', '\1')); end loop;
        conds := conds || case when cardinality(items) = 0 then 'false' else format('%I in (%s)', k, array_to_string(items, ',')) end;
      elsif op = 'is' and val = 'null' then conds := conds || format('%I is null', k);
      elsif op = 'eq' then conds := conds || format('%I = %L', k, val);
      elsif op = 'neq' then conds := conds || format('%I <> %L', k, val);
      elsif op = 'gt' then conds := conds || format('%I > %L', k, val);
      elsif op = 'gte' then conds := conds || format('%I >= %L', k, val);
      elsif op = 'lt' then conds := conds || format('%I < %L', k, val);
      elsif op = 'lte' then conds := conds || format('%I <= %L', k, val);
      else raise exception 'סינון לא נתמך: %', op using errcode = '22023'; end if;
    end if;
  end loop;
  if cardinality(sel) = 0 then sel := allowed; end if;

  -- עובד מחובר (לא עורך סידור): בהגשות - רק שלו
  if v_kind = 'worker' then
    if p_table in ('constraint_submissions','constraint_exceptions') then conds := conds || format('worker_id = %L', v_wid);
    elsif p_table = 'constraint_entries' then conds := conds || format('submission_id in (select s.id from public.constraint_submissions s where s.worker_id = %L)', v_wid);
    end if;
  end if;

  execute format('select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) from (select %s from public.%I%s%s%s%s) q',
    (select string_agg(format('%I', x), ',') from unnest(sel) x), p_table,
    case when cardinality(conds) > 0 then ' where ' || array_to_string(conds, ' and ') else '' end,
    case when cardinality(ords) > 0 then ' order by ' || array_to_string(ords, ',') else '' end,
    case when lim is not null then ' limit ' || lim else '' end,
    case when off is not null then ' offset ' || off else '' end) into res;
  return res;
end; $function$;
revoke all on function public.app_get(jsonb, text, jsonb) from public;
grant execute on function public.app_get(jsonb, text, jsonb) to anon, authenticated;

-- (2) גרסאות מוגנות לפונקציות הקריאה שעבדו בלי זיהוי
create or replace function public.sched_task_rows_list_v2(p_sectors text[], p_from date, p_to date, p_auths jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not exists(select 1 from public.app_auth(p_auths) a where a.kind = 'staff') then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('sector', sector, 'date', entry_date, 'rows', rows)), '[]'::jsonb)
    from public.schedule_task_days where sector = any(p_sectors) and entry_date between p_from and p_to);
end; $function$;
create or replace function public.schedule_original_v2(p_sectors text[], p_from date, p_to date, p_auths jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not exists(select 1 from public.app_auth(p_auths)) then raise exception 'נדרשת התחברות' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
    select e from public.schedule_snapshots s, jsonb_array_elements(s.assignments) e
     where s.sector = any(p_sectors) and (e->>'entry_date')::date between p_from and p_to) q);
end; $function$;
create or replace function public.swap_history_v2(p_sectors text[], p_from date, p_to date, p_auths jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not exists(select 1 from public.app_auth(p_auths)) then raise exception 'נדרשת התחברות' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('sector', r.sector, 'entry_date', r.entry_date, 'shift_type', r.shift_type,
      'from_name', w.name, 'to_name', r.taken_by_name, 'closed_at', r.closed_at, 'by_kind', r.resolved_by_kind, 'by_name', r.resolved_by_name) order by r.entry_date, r.sector), '[]'::jsonb)
    from public.swap_requests r join public.roster_workers w on w.id = r.worker_id
   where r.status = 'done' and r.sector = any(p_sectors) and r.entry_date between p_from and p_to);
end; $function$;
revoke all on function public.sched_task_rows_list_v2(text[], date, date, jsonb) from public;
revoke all on function public.schedule_original_v2(text[], date, date, jsonb) from public;
revoke all on function public.swap_history_v2(text[], date, date, jsonb) from public;
grant execute on function public.sched_task_rows_list_v2(text[], date, date, jsonb) to anon, authenticated;
grant execute on function public.schedule_original_v2(text[], date, date, jsonb) to anon, authenticated;
grant execute on function public.swap_history_v2(text[], date, date, jsonb) to anon, authenticated;
