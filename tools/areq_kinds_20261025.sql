-- ===== (2026-10-25, סרגיי: "תוסיף לקב"ט אפשרות להוסיף ולערוך את הרשימות של חופשה/מילואים/מחלה וכו'" - "גם וגם")
-- 1. סוגי בקשות שהקב"ט מוסיף ועורך (מעבר לחופשה / מילואים / מחלה) - טבלה areq_kinds. סוג לא נמחק אף פעם, רק מוסתר.
-- 2. הקב"ט רושם בעצמו חופשה / מילואים / מחלה לעובד, עורך תאריכים/סוג ומבטל (ביטול = סטטוס "בוטלה", לא מחיקה).
-- לא נמחק שום מידע קיים. =====
create table if not exists public.areq_kinds (
  key text primary key,
  label text not null,
  icon text not null default '📝',
  builtin boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 100,
  updated_by text,
  updated_at timestamptz not null default now());
alter table public.areq_kinds enable row level security;
revoke all on public.areq_kinds from public, anon, authenticated;
insert into public.areq_kinds (key, label, icon, builtin, sort_order) values
  ('vacation','חופשה','🏖️',true,1), ('reserve','מילואים','🪖',true,2), ('sick','מחלה','🤒',true,3)
on conflict (key) do nothing;

alter table public.admin_requests drop constraint if exists admin_requests_kind_check;
alter table public.admin_requests add column if not exists created_by_name text;

create or replace function public.areq_kind_he(k text)
 returns text language sql stable security definer set search_path to 'public'
as $function$ select coalesce((select label from public.areq_kinds where key = k), case k when 'vacation' then 'חופשה' when 'reserve' then 'מילואים' when 'sick' then 'מחלה' else k end) $function$;

-- רשימת הסוגים (לטופס של העובד ולמסכי הקב"ט). לא רגיש - פתוח לקריאה.
create or replace function public.areq_kinds_list()
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'icon', icon, 'builtin', builtin, 'active', active) order by sort_order, label), '[]'::jsonb) from public.areq_kinds;
$function$;
revoke all on function public.areq_kinds_list() from public;
grant execute on function public.areq_kinds_list() to anon, authenticated;

-- מנהל עם צוותים (קב"ט) או מנהל מערכת
create or replace function public.areq_mgr(p_token text, out id uuid, out name text, out is_admin boolean, out teams uuid[])
 language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  select m.id, m.name, coalesce(m.is_admin,false), coalesce(m.logistics_team_ids, '{}') into id, name, is_admin, teams
    from public.manager_sessions s join public.managers m on m.id = s.manager_id where s.token = p_token and s.expires_at > now();
  if id is null then raise exception 'session expired' using errcode = '28000'; end if;
  if not is_admin and coalesce(array_length(teams,1),0) = 0 then raise exception 'אין הרשאה' using errcode = '42501'; end if;
end; $function$;
revoke all on function public.areq_mgr(text) from public, anon, authenticated;

-- הוספה / עריכה של סוג (p_key ריק = סוג חדש). p_active=false מסתיר את הסוג מהטופס (הבקשות הקיימות נשארות).
create or replace function public.mgr_areq_kind_save(p_token text, p_key text, p_label text, p_icon text, p_active boolean)
 returns text language plpgsql security definer set search_path to 'public'
as $function$
declare m record; v_label text := left(nullif(btrim(coalesce(p_label,'')),''), 40); v_icon text := left(coalesce(nullif(btrim(coalesce(p_icon,'')),''), '📝'), 8); v_key text;
begin
  select * into m from public.areq_mgr(p_token);
  if v_label is null then raise exception 'כתבו שם לסוג'; end if;
  if coalesce(p_key,'') = '' then
    if exists(select 1 from public.areq_kinds where label = v_label) then raise exception 'כבר יש סוג בשם הזה'; end if;
    v_key := 'k_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    insert into public.areq_kinds (key, label, icon, sort_order, updated_by) values (v_key, v_label, v_icon, 50 + (select count(*) from public.areq_kinds)::int, m.name);
    return v_key;
  end if;
  update public.areq_kinds set label = v_label, icon = v_icon, active = case when builtin then true else coalesce(p_active, active) end, updated_by = m.name, updated_at = now()
   where key = p_key;
  if not found then raise exception 'הסוג לא נמצא'; end if;
  return p_key;
end; $function$;
revoke all on function public.mgr_areq_kind_save(text,text,text,text,boolean) from public;
grant execute on function public.mgr_areq_kind_save(text,text,text,text,boolean) to anon, authenticated;

-- העובדים שהקב"ט יכול לרשום להם (הצוותים שלו; מנהל מערכת - כולם)
create or replace function public.mgr_areq_workers(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare m record;
begin
  select * into m from public.areq_mgr(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'team_id', w.team_id) order by w.name)
    from public.roster_workers w where m.is_admin or w.team_id = any(m.teams)), '[]'::jsonb);
end; $function$;
revoke all on function public.mgr_areq_workers(text) from public;
grant execute on function public.mgr_areq_workers(text) to anon, authenticated;

-- הקב"ט רושם לעובד חופשה / מילואים / מחלה / סוג אחר - נרשם כ"מאושר", והעובד מקבל התראה
create or replace function public.mgr_admin_req_add(p_token text, p_worker uuid, p_kind text, p_from date, p_to date, p_note text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare m record; w record; v uuid;
begin
  select * into m from public.areq_mgr(p_token);
  select rw.id, rw.name, rw.team_id into w from public.roster_workers rw where rw.id = p_worker and (m.is_admin or rw.team_id = any(m.teams));
  if w.id is null then raise exception 'העובד לא נמצא'; end if;
  if not exists(select 1 from public.areq_kinds where key = p_kind and active) then raise exception 'סוג לא תקין'; end if;
  if p_from is null or p_to is null then raise exception 'צריך לבחור תאריכים'; end if;
  if p_to < p_from then raise exception 'תאריך הסיום לפני תאריך ההתחלה'; end if;
  if p_to - p_from > 366 then raise exception 'טווח תאריכים ארוך מדי'; end if;
  insert into public.admin_requests (worker_id, team_id, worker_name, kind, date_from, date_to, note, status, handled_by, handled_by_name, handled_at, created_by_name, seen_by)
  values (w.id, w.team_id, w.name, p_kind, p_from, p_to, left(nullif(btrim(coalesce(p_note,'')),''), 2000), 'approved', m.id, m.name, now(), m.name, array[m.id])
  returning id into v;
  insert into public.push_outbox (worker_id, title, body, url, tag)
  select w.id, '📝 נרשמה לך ' || public.areq_kind_he(p_kind), public.areq_dates_txt(p_from, p_to) || ' · ע"י ' || m.name, './', 'areqr-' || v
   where exists(select 1 from public.push_subscriptions s where s.worker_id = w.id);
  return v;
end; $function$;
revoke all on function public.mgr_admin_req_add(text,uuid,text,date,date,text) from public;
grant execute on function public.mgr_admin_req_add(text,uuid,text,date,date,text) to anon, authenticated;

-- הקב"ט עורך סוג / תאריכים / הערה של בקשה (הסטטוס לא משתנה; התאריכים הקודמים נשמרים)
create or replace function public.mgr_admin_req_edit(p_token text, p_req uuid, p_kind text, p_from date, p_to date, p_note text)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare m record; r public.admin_requests;
begin
  select * into m from public.areq_mgr(p_token);
  select * into r from public.admin_requests where id = p_req and (m.is_admin or team_id = any(m.teams));
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status = 'cancelled' then raise exception 'הבקשה בוטלה'; end if;
  if p_kind <> r.kind and not exists(select 1 from public.areq_kinds where key = p_kind) then raise exception 'סוג לא תקין'; end if;
  if p_from is null or p_to is null then raise exception 'צריך לבחור תאריכים'; end if;
  if p_to < p_from then raise exception 'תאריך הסיום לפני תאריך ההתחלה'; end if;
  if p_to - p_from > 366 then raise exception 'טווח תאריכים ארוך מדי'; end if;
  update public.admin_requests set kind = p_kind, note = left(nullif(btrim(coalesce(p_note,'')),''), 2000),
         prev_date_from = case when p_from <> r.date_from or p_to <> r.date_to then r.date_from else prev_date_from end,
         prev_date_to = case when p_from <> r.date_from or p_to <> r.date_to then r.date_to else prev_date_to end,
         changed_at = case when p_from <> r.date_from or p_to <> r.date_to or p_kind <> r.kind then now() else changed_at end,
         date_from = p_from, date_to = p_to
   where id = r.id;
  if p_from <> r.date_from or p_to <> r.date_to or p_kind <> r.kind then
    insert into public.push_outbox (worker_id, title, body, url, tag)
    select r.worker_id, '📅 הקב"ט עדכן: ' || public.areq_kind_he(p_kind), public.areq_dates_txt(p_from, p_to) || case when p_from <> r.date_from or p_to <> r.date_to then ' (היה ' || public.areq_dates_txt(r.date_from, r.date_to) || ')' else '' end, './', 'areqr-' || r.id
     where exists(select 1 from public.push_subscriptions s where s.worker_id = r.worker_id);
  end if;
  return true;
end; $function$;
revoke all on function public.mgr_admin_req_edit(text,uuid,text,date,date,text) from public;
grant execute on function public.mgr_admin_req_edit(text,uuid,text,date,date,text) to anon, authenticated;

-- הקב"ט מבטל (סטטוס "בוטלה" - נשמר בהיסטוריה)
create or replace function public.mgr_admin_req_cancel(p_token text, p_req uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare m record; r public.admin_requests;
begin
  select * into m from public.areq_mgr(p_token);
  select * into r from public.admin_requests where id = p_req and (m.is_admin or team_id = any(m.teams));
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status = 'cancelled' then return true; end if;
  update public.admin_requests set status = 'cancelled', cancelled_at = now(), handled_by = m.id, handled_by_name = m.name, handled_at = now() where id = r.id;
  insert into public.push_outbox (worker_id, title, body, url, tag)
  select r.worker_id, '🚫 בוטלה: ' || public.areq_kind_he(r.kind), public.areq_dates_txt(r.date_from, r.date_to) || ' · ע"י ' || m.name, './', 'areqr-' || r.id
   where exists(select 1 from public.push_subscriptions s where s.worker_id = r.worker_id);
  return true;
end; $function$;
revoke all on function public.mgr_admin_req_cancel(text,uuid) from public;
grant execute on function public.mgr_admin_req_cancel(text,uuid) to anon, authenticated;

-- העובד: כל סוג פעיל מהרשימה (לא רק שלושת הקבועים)
create or replace function public.worker_admin_req_create(p_token text, p jsonb)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_w uuid; w record; v uuid; v_from date; v_to date; v_kind text := p->>'kind';
begin
  v_w := public.worker_session_worker(p_token);
  select rw.id, rw.name, rw.team_id into w from public.roster_workers rw where rw.id = v_w;
  if not exists(select 1 from public.areq_kinds where key = v_kind and active) then raise exception 'סוג בקשה לא תקין'; end if;
  begin v_from := (p->>'date_from')::date; v_to := (p->>'date_to')::date; exception when others then raise exception 'תאריכים לא תקינים'; end;
  if v_from is null or v_to is null then raise exception 'צריך לבחור תאריכים'; end if;
  if v_to < v_from then raise exception 'תאריך הסיום לפני תאריך ההתחלה'; end if;
  if v_to - v_from > 366 then raise exception 'טווח תאריכים ארוך מדי'; end if;
  insert into public.admin_requests (worker_id, team_id, worker_name, kind, date_from, date_to, note)
  values (v_w, w.team_id, w.name, v_kind, v_from, v_to, left(nullif(btrim(coalesce(p->>'note','')),''), 2000))
  returning id into v;
  insert into public.push_outbox (manager_id, title, body, url, tag)
  select distinct s.manager_id, '📝 בקשה ל' || public.areq_kind_he(v_kind),
         w.name || ' · ' || to_char(v_from,'DD/MM') || case when v_to <> v_from then '–' || to_char(v_to,'DD/MM') else '' end, './', 'areq-' || v
    from public.push_subscriptions s join public.managers m on m.id = s.manager_id
   where m.is_admin or w.team_id = any(m.logistics_team_ids);
  return v;
end; $function$;

-- לטבלת השיבוץ: גם שם הסוג והאייקון (כולל סוגים שהקב"ט הוסיף)
create or replace function public.sched_absences(p_pin text, p_worker_ids uuid[], p_from date, p_to date)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_scope uuid[];
begin
  if coalesce(p_pin, '') = '' or p_from is null or p_to is null or p_to - p_from > 62 then return '[]'::jsonb; end if;
  if not public.verify_edit_pin(p_pin) then return '[]'::jsonb; end if;
  v_scope := public.pin_scope_teams(p_pin);
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'worker_id', r.worker_id, 'worker_name', r.worker_name, 'kind', r.kind,
            'label', coalesce(k.label, r.kind), 'icon', coalesce(k.icon, '📝'), 'from', r.date_from, 'to', r.date_to, 'status', r.status) order by r.date_from, r.worker_name)
    from public.admin_requests r left join public.areq_kinds k on k.key = r.kind
   where r.worker_id = any(p_worker_ids) and r.status in ('pending','approved') and r.date_from <= p_to and r.date_to >= p_from
     and (v_scope is null or exists(select 1 from unnest(v_scope) st where public.team_sched_sectors(st) && public.team_sched_sectors(r.team_id)))), '[]'::jsonb);
end; $function$;

select 'עודכן' as status;
