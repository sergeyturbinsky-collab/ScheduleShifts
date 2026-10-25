-- ===== (2026-10-25, סרגיי) חופשה / מילואים / מחלה: ביטול ושינוי תאריכים ע"י העובד גם אחרי הגשה/אישור,
-- ותצוגה לקב"ט מתחת לטבלת השיבוץ ובטבלת הזמינות. לא נמחקת אף בקשה - ביטול = סטטוס "בוטלה" (נשמרת בהיסטוריה). =====
alter table public.admin_requests add column if not exists cancelled_at timestamptz;
alter table public.admin_requests add column if not exists changed_at timestamptz;
alter table public.admin_requests add column if not exists prev_date_from date;
alter table public.admin_requests add column if not exists prev_date_to date;
alter table public.admin_requests drop constraint if exists admin_requests_status_check;
alter table public.admin_requests add constraint admin_requests_status_check check (status = any (array['pending','approved','rejected','cancelled']));

create or replace function public.areq_dates_txt(f date, t date)
 returns text language sql immutable
as $function$ select to_char(f,'DD/MM') || case when t <> f then '–' || to_char(t,'DD/MM') else '' end $function$;

create or replace function public.worker_admin_req_cancel(p_token text, p_req uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_w uuid := public.worker_session_worker(p_token); r public.admin_requests;
begin
  select * into r from public.admin_requests where id = p_req and worker_id = v_w;
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status not in ('pending','approved') then raise exception 'אפשר לבטל רק בקשה שממתינה או שאושרה'; end if;
  update public.admin_requests set status = 'cancelled', cancelled_at = now(), seen_by = '{}' where id = r.id;
  insert into public.push_outbox (manager_id, title, body, url, tag)
  select distinct s.manager_id, '🚫 בוטלה בקשה ל' || public.areq_kind_he(r.kind),
         r.worker_name || ' · ' || public.areq_dates_txt(r.date_from, r.date_to) || case when r.status = 'approved' then ' (הייתה מאושרת)' else '' end, './', 'areq-' || r.id
    from public.push_subscriptions s join public.managers m on m.id = s.manager_id
   where m.is_admin or r.team_id = any(m.logistics_team_ids);
  return true;
end; $function$;
revoke all on function public.worker_admin_req_cancel(text,uuid) from public;
grant execute on function public.worker_admin_req_cancel(text,uuid) to anon, authenticated;

-- שינוי תאריכים: הבקשה חוזרת ל"ממתינה" (גם אם כבר אושרה) - הקב"ט מאשר את התאריכים החדשים. התאריכים הקודמים נשמרים.
create or replace function public.worker_admin_req_update(p_token text, p_req uuid, p_from date, p_to date, p_note text)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_w uuid := public.worker_session_worker(p_token); r public.admin_requests; v_note text;
begin
  select * into r from public.admin_requests where id = p_req and worker_id = v_w;
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status not in ('pending','approved') then raise exception 'אפשר לשנות רק בקשה שממתינה או שאושרה'; end if;
  if p_from is null or p_to is null then raise exception 'צריך לבחור תאריכים'; end if;
  if p_to < p_from then raise exception 'תאריך הסיום לפני תאריך ההתחלה'; end if;
  if p_to - p_from > 366 then raise exception 'טווח תאריכים ארוך מדי'; end if;
  v_note := case when p_note is null then r.note else left(nullif(btrim(p_note),''), 2000) end;
  if p_from = r.date_from and p_to = r.date_to then
    update public.admin_requests set note = v_note where id = r.id;
    return true;
  end if;
  update public.admin_requests set prev_date_from = r.date_from, prev_date_to = r.date_to, date_from = p_from, date_to = p_to, note = v_note,
         changed_at = now(), status = 'pending', handled_by = null, handled_by_name = null, handled_at = null, seen_by = '{}'
   where id = r.id;
  insert into public.push_outbox (manager_id, title, body, url, tag)
  select distinct s.manager_id, '📅 שינוי תאריכים — ' || public.areq_kind_he(r.kind),
         r.worker_name || ' · ' || public.areq_dates_txt(p_from, p_to) || ' (היה ' || public.areq_dates_txt(r.date_from, r.date_to) || ')'
           || case when r.status = 'approved' then ' · צריך אישור מחדש' else '' end, './', 'areq-' || r.id
    from public.push_subscriptions s join public.managers m on m.id = s.manager_id
   where m.is_admin or r.team_id = any(m.logistics_team_ids);
  return true;
end; $function$;
revoke all on function public.worker_admin_req_update(text,uuid,date,date,text) from public;
grant execute on function public.worker_admin_req_update(text,uuid,date,date,text) to anon, authenticated;

-- הקב"ט לא יכול לאשר/לדחות בקשה שהעובד ביטל
create or replace function public.mgr_admin_req_resolve(p_token text, p_req uuid, p_status text, p_note text)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_mgr uuid; v_name text; v_admin boolean; v_teams uuid[]; r public.admin_requests;
begin
  select m.id, m.name, m.is_admin, m.logistics_team_ids into v_mgr, v_name, v_admin, v_teams
    from public.manager_sessions s join public.managers m on m.id = s.manager_id where s.token = p_token and s.expires_at > now();
  if v_mgr is null then raise exception 'session expired' using errcode = '28000'; end if;
  if p_status not in ('approved','rejected','pending') then raise exception 'סטטוס לא תקין'; end if;
  select * into r from public.admin_requests where id = p_req and (v_admin or team_id = any(v_teams));
  if r.id is null then raise exception 'הבקשה לא נמצאה'; end if;
  if r.status = 'cancelled' then raise exception 'העובד ביטל את הבקשה הזו'; end if;
  update public.admin_requests set status = p_status, mgr_note = left(nullif(btrim(coalesce(p_note,'')),''),1000),
         handled_by = case when p_status='pending' then null else v_mgr end, handled_by_name = case when p_status='pending' then null else v_name end,
         handled_at = case when p_status='pending' then null else now() end
   where id = p_req;
  if p_status <> 'pending' then
    insert into public.push_outbox (worker_id, title, body, url, tag)
    select r.worker_id, case when p_status='approved' then '✅ הבקשה ל' || public.areq_kind_he(r.kind) || ' אושרה' else '❌ הבקשה ל' || public.areq_kind_he(r.kind) || ' נדחתה' end,
           to_char(r.date_from,'DD/MM') || case when r.date_to <> r.date_from then '–' || to_char(r.date_to,'DD/MM') else '' end || coalesce(' · ' || nullif(btrim(coalesce(p_note,'')),''), ''), './', 'areqr-' || r.id
     where exists(select 1 from public.push_subscriptions s where s.worker_id = r.worker_id);
  end if;
  return true;
end; $function$;

-- לטבלת השיבוץ ולטבלת הזמינות: חופשות / מילואים / מחלה (ממתינות ומאושרות) של עובדי הגזרה בתקופה.
-- רק למי שמחובר עם הרשאת עריכת סידור לגזרה (מנהל / עורך סידור / קוד העריכה). אחרת - רשימה ריקה.
create or replace function public.sched_absences(p_pin text, p_worker_ids uuid[], p_from date, p_to date)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_scope uuid[];
begin
  if coalesce(p_pin, '') = '' or p_from is null or p_to is null or p_to - p_from > 62 then return '[]'::jsonb; end if;
  if not public.verify_edit_pin(p_pin) then return '[]'::jsonb; end if;
  v_scope := public.pin_scope_teams(p_pin);
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'worker_id', r.worker_id, 'worker_name', r.worker_name, 'kind', r.kind,
            'from', r.date_from, 'to', r.date_to, 'status', r.status) order by r.date_from, r.worker_name)
    from public.admin_requests r
   where r.worker_id = any(p_worker_ids) and r.status in ('pending','approved') and r.date_from <= p_to and r.date_to >= p_from
     and (v_scope is null or exists(select 1 from unnest(v_scope) st where public.team_sched_sectors(st) && public.team_sched_sectors(r.team_id)))), '[]'::jsonb);
end; $function$;
revoke all on function public.sched_absences(text,uuid[],date,date) from public;
grant execute on function public.sched_absences(text,uuid[],date,date) to anon, authenticated;

select 'עודכן' as status;
