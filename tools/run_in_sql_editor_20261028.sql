-- (הוחל במערכת החיה 2026-10-28 ע"י סרגיי ב-SQL Editor; נבדק בבדיקה עם ביטול)
-- ===== (2026-10-28, סרגיי: "ברגע שעובד מסמן שהוא במחלה/מילואים וכו' בשבוע של סידור שכבר פורסם - שזה יוריד אותו מכלל המשמרות
--  לאותו שבוע, ויקפיץ התראה לכלל העובדים וההנהלה שהמשמרות פנויות להשתבץ אליהן")
-- בקשה מנהלתית (חופשה / מילואים / מחלה / סוג אחר) בתאריכים של סידור שפורסם: המשמרות של העובד מהיום והלאה בתאריכים האלה
-- יורדות מהסידור ונשמרות כ"משמרות פנויות" (shift_vacancies). כל עובדי הגזרה וההנהלה מקבלים התראה, ועובד יכול לקחת משמרת פנויה.
-- אם הבקשה מבוטלת / נדחית / התאריכים מתקצרים - משמרת שעוד לא נלקחה חוזרת לעובד. =====
create table if not exists public.shift_vacancies (
  id uuid primary key default gen_random_uuid(),
  sector text not null, entry_date date not null, shift_type text not null,
  custom_start time, custom_end time, filled_role text,
  released_worker uuid, released_name text, reason text, req_id uuid,
  status text not null default 'open' check (status in ('open','taken','restored','closed')),
  created_at timestamptz not null default now(),
  taken_by uuid, taken_by_name text, closed_at timestamptz, closed_by text);
create index if not exists shift_vacancies_open_idx on public.shift_vacancies (status, entry_date);
alter table public.shift_vacancies enable row level security;
revoke all on public.shift_vacancies from public, anon, authenticated;

create or replace function public.areq_release_shifts(p_req uuid)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare r public.admin_requests; a record; v_today date := (now() at time zone 'Asia/Jerusalem')::date; n int := 0; v_lbl text; v_txt text;
begin
  select * into r from public.admin_requests where id = p_req;
  if r.id is null or r.status not in ('pending','approved') then return 0; end if;
  v_lbl := public.areq_kind_he(r.kind);
  for a in select sa.* from public.shift_assignments sa
            where sa.worker_id = r.worker_id and sa.entry_date between greatest(r.date_from, v_today) and r.date_to
              and exists(select 1 from public.schedule_publications p where p.sector = sa.sector and sa.entry_date between p.period_start and p.period_end)
              and coalesce(lower(public.assignment_interval(sa.sector, sa.entry_date, sa.shift_type, sa.custom_start, sa.custom_end)) > now(), true) -- רק משמרות שעוד לא התחילו
            order by sa.entry_date loop
    perform public.snapshot_ensure(a.sector, a.entry_date);
    if a.shadow_of is null then
      insert into public.shift_vacancies (sector, entry_date, shift_type, custom_start, custom_end, filled_role, released_worker, released_name, reason, req_id)
      values (a.sector, a.entry_date, a.shift_type, a.custom_start, a.custom_end, a.filled_role, r.worker_id, r.worker_name, v_lbl, r.id);
      n := n + 1;
    end if;
    delete from public.shift_assignments where id = a.id;
    -- חניך בחפיפה אצלו נשאר במשמרת; כשמישהו לוקח את המשמרת - החפיפה עוברת אליו
    insert into public.schedule_change_log (sector, entry_date, shift_type, actor, kind, worker_id, worker_name, detail, auto)
    values (a.sector, a.entry_date, a.shift_type, r.worker_name, 'remove', r.worker_id, r.worker_name, 'ירד מהמשמרת — ' || v_lbl || ' (בקשה מנהלתית). המשמרת פנויה', true);
  end loop;
  if n > 0 then
    v_txt := (select string_agg(to_char(v.entry_date,'DD/MM') || ' ' || public.shift_label_he(v.shift_type), ', ' order by v.entry_date)
                from public.shift_vacancies v where v.req_id = r.id and v.status = 'open');
    -- לכל עובדי הגזרה (חוץ מהעובד עצמו)
    insert into public.push_outbox (worker_id, title, body, url, tag)
    select distinct s.worker_id, '🆘 משמרות פנויות להשתבצות', coalesce(r.worker_name,'עובד') || ' ב' || v_lbl || ' — פנוי: ' || left(v_txt, 160) || '. נכנסים לאפליקציה כדי לקחת משמרת.', './', 'vac-' || r.id
      from public.push_subscriptions s
     where s.gone_at is null and s.worker_id <> r.worker_id
       and s.worker_id in (select f from public.shift_vacancies v, public.frame_workers(v.sector) f where v.req_id = r.id and v.status = 'open');
    -- להנהלה (הקב"טים של העובד וסרגיי)
    insert into public.push_outbox (manager_id, title, body, url, tag)
    select distinct s.manager_id, '🆘 משמרות התפנו', coalesce(r.worker_name,'עובד') || ' ב' || v_lbl || ' — ירד מ: ' || left(v_txt, 170), './', 'vac-' || r.id
      from public.push_subscriptions s
     where s.gone_at is null and s.manager_id is not null
       and (s.manager_id in (select public.frame_managers(r.worker_id)) or s.manager_id in (select id from public.managers where is_admin));
  end if;
  return n;
end; $function$;
revoke all on function public.areq_release_shifts(uuid) from public, anon, authenticated;

-- משמרת שעוד לא נלקחה חוזרת לעובד (בקשה בוטלה / נדחתה / התאריכים קוצרו)
create or replace function public.areq_restore_shifts(p_req uuid, p_from date, p_to date)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v record; n int := 0; w record;
begin
  for v in select * from public.shift_vacancies where req_id = p_req and status = 'open'
             and (p_from is null or entry_date not between p_from and p_to) loop
    select id, team_id, name into w from public.roster_workers where id = v.released_worker;
    if w.id is not null and not exists(select 1 from public.shift_assignments where sector = v.sector and entry_date = v.entry_date and shift_type = v.shift_type and worker_id = w.id) then
      insert into public.shift_assignments (sector, entry_date, shift_type, worker_id, team_id, method, custom_start, custom_end, filled_role)
      values (v.sector, v.entry_date, v.shift_type, w.id, w.team_id, 'manual', v.custom_start, v.custom_end, v.filled_role);
      insert into public.schedule_change_log (sector, entry_date, shift_type, actor, kind, worker_id, worker_name, detail, auto)
      values (v.sector, v.entry_date, v.shift_type, null, 'add', w.id, w.name, 'חזר למשמרת (הבקשה המנהלתית בוטלה / שונתה)', true);
    end if;
    update public.shift_vacancies set status = 'restored', closed_at = now() where id = v.id;
    n := n + 1;
  end loop;
  return n;
end; $function$;
revoke all on function public.areq_restore_shifts(uuid,date,date) from public, anon, authenticated;

-- טריגר על הבקשות המנהלתיות - בלי לשנות את הפונקציות הקיימות
create or replace function public.trg_areq_shifts()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.areq_release_shifts(new.id);
    elsif new.status in ('cancelled','rejected') and old.status not in ('cancelled','rejected') then
      perform public.areq_restore_shifts(new.id, null, null);
    elsif new.status in ('pending','approved') and (new.date_from <> old.date_from or new.date_to <> old.date_to or old.status in ('cancelled','rejected')) then
      perform public.areq_restore_shifts(new.id, new.date_from, new.date_to);
      perform public.areq_release_shifts(new.id);
    end if;
  exception when others then
    raise warning 'trg_areq_shifts: %', sqlerrm; -- תקלה כאן לא תעצור את שמירת הבקשה
  end;
  return new;
end; $function$;
create or replace trigger areq_shifts after insert or update on public.admin_requests for each row execute function public.trg_areq_shifts();

-- עובד: המשמרות הפנויות בגזרה שלו
create or replace function public.worker_vacancies(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_w uuid := public.worker_session_worker(p_token); v_today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'sector', v.sector, 'entry_date', v.entry_date, 'shift_type', v.shift_type,
      'custom_start', v.custom_start, 'custom_end', v.custom_end, 'reason', v.reason, 'released_name', v.released_name,
      'already', exists(select 1 from public.shift_assignments a where a.worker_id = v_w and a.entry_date = v.entry_date)) order by v.entry_date, v.shift_type)
    from public.shift_vacancies v where v.status = 'open' and v.entry_date >= v_today and v.released_worker <> v_w
      and coalesce(lower(public.assignment_interval(v.sector, v.entry_date, v.shift_type, v.custom_start, v.custom_end)) > now(), true)
      and exists(select 1 from public.frame_workers(v.sector) f where f = v_w)), '[]'::jsonb);
end; $function$;
revoke all on function public.worker_vacancies(text) from public;
grant execute on function public.worker_vacancies(text) to anon, authenticated;

create or replace function public.vacancy_fill(p_id uuid, p_worker uuid, p_by text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v public.shift_vacancies; w record; v_txt text;
begin
  select * into v from public.shift_vacancies where id = p_id for update;
  if v.id is null or v.status <> 'open' then raise exception 'המשמרת כבר לא פנויה'; end if;
  if not coalesce(lower(public.assignment_interval(v.sector, v.entry_date, v.shift_type, v.custom_start, v.custom_end)) > now(), true) then raise exception 'המשמרת כבר התחילה'; end if;
  select id, name, team_id into w from public.roster_workers where id = p_worker;
  if w.id is null then raise exception 'העובד לא נמצא'; end if;
  if exists(select 1 from public.shift_assignments where worker_id = w.id and entry_date = v.entry_date) then raise exception 'העובד כבר משובץ ביום הזה'; end if;
  perform public.snapshot_ensure(v.sector, v.entry_date);
  insert into public.shift_assignments (sector, entry_date, shift_type, worker_id, team_id, method, custom_start, custom_end, filled_role)
  values (v.sector, v.entry_date, v.shift_type, w.id, w.team_id, 'manual', v.custom_start, v.custom_end, v.filled_role);
  update public.shift_assignments set shadow_of = w.id where sector = v.sector and entry_date = v.entry_date and shift_type = v.shift_type and shadow_of = v.released_worker;
  update public.shift_vacancies set status = 'taken', taken_by = w.id, taken_by_name = w.name, closed_at = now(), closed_by = p_by where id = v.id;
  insert into public.schedule_change_log (sector, entry_date, shift_type, actor, kind, worker_id, worker_name, detail, auto)
  values (v.sector, v.entry_date, v.shift_type, p_by, 'add', w.id, w.name, 'לקח משמרת פנויה (במקום ' || coalesce(v.released_name,'') || ')', false);
  v_txt := to_char(v.entry_date,'DD/MM') || ' · ' || public.shift_label_he(v.shift_type) || ' · ' || v.sector || ': ' || w.name || ' (במקום ' || coalesce(v.released_name,'') || ')';
  insert into public.push_outbox (manager_id, title, body, url, tag)
  select distinct s.manager_id, '✔ משמרת פנויה אוישה', v_txt, './', 'vacdone-' || v.id
    from public.push_subscriptions s where s.gone_at is null and s.manager_id is not null
     and (s.manager_id in (select public.frame_managers(v.released_worker)) or s.manager_id in (select id from public.managers where is_admin));
  insert into public.push_outbox (worker_id, title, body, url, tag)
  select w.id, '✔ שובצת למשמרת', v_txt, './', 'vacdone-' || v.id where exists(select 1 from public.push_subscriptions s where s.worker_id = w.id and s.gone_at is null);
  return jsonb_build_object('ok', true);
end; $function$;
revoke all on function public.vacancy_fill(uuid,uuid,text) from public, anon, authenticated;

create or replace function public.worker_vacancy_take(p_token text, p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_w uuid := public.worker_session_worker(p_token); v public.shift_vacancies;
begin
  select * into v from public.shift_vacancies where id = p_id;
  if v.id is null or not exists(select 1 from public.frame_workers(v.sector) f where f = v_w) then raise exception 'המשמרת לא נמצאה'; end if;
  return public.vacancy_fill(p_id, v_w, (select name from public.roster_workers where id = v_w));
end; $function$;
revoke all on function public.worker_vacancy_take(text,uuid) from public;
grant execute on function public.worker_vacancy_take(text,uuid) to anon, authenticated;

-- מנהל: רשימת המשמרות הפנויות בגזרות שלו, וסגירה (כשמילא בעצמו בסידור)
create or replace function public.mgr_vacancies(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_mgr uuid := public.mgr_session_manager(p_token); v_secs text[] := public.mgr_scope_sectors(v_mgr); v_today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'sector', v.sector, 'entry_date', v.entry_date, 'shift_type', v.shift_type,
      'custom_start', v.custom_start, 'custom_end', v.custom_end, 'reason', v.reason, 'released_name', v.released_name, 'created_at', v.created_at) order by v.entry_date, v.shift_type)
    from public.shift_vacancies v where v.status = 'open' and v.entry_date >= v_today and v.sector = any(v_secs)), '[]'::jsonb);
end; $function$;
revoke all on function public.mgr_vacancies(text) from public;
grant execute on function public.mgr_vacancies(text) to anon, authenticated;

create or replace function public.mgr_vacancy_close(p_token text, p_id uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_mgr uuid := public.mgr_session_manager(p_token);
begin
  update public.shift_vacancies set status = 'closed', closed_at = now(), closed_by = (select name from public.managers where id = v_mgr)
   where id = p_id and status = 'open' and sector = any(public.mgr_scope_sectors(v_mgr));
  return found;
end; $function$;
revoke all on function public.mgr_vacancy_close(text,uuid) from public;
grant execute on function public.mgr_vacancy_close(text,uuid) to anon, authenticated;

select 'עודכן' as status;
-- ===== (2026-10-28, סרגיי: "בהיסטוריית סידור שאתה שומר - תעשה אפשרות של מחיקת היסטוריה, ואפשרות לבחור טווח ממתי למחוק")
-- מחיקה לפי גזרה וטווח תאריכים (לפי מועד השינוי). רשומות schedule_change_log בטווח נמחקות; חילופים (swap_requests) לא נמחקים
-- כי הם נתוני עבודה - רק מוסתרים מההיסטוריה דרך change_log_purges. =====
create table if not exists public.change_log_purges (
  id bigserial primary key, sector text not null, from_date date not null, to_date date not null,
  by_name text, at timestamptz not null default now(), removed integer);
alter table public.change_log_purges enable row level security;
revoke all on public.change_log_purges from public, anon, authenticated;

create or replace function public.change_log_hidden(p_sector text, p_at timestamptz)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists(select 1 from public.change_log_purges g where g.sector = p_sector
                 and (p_at at time zone 'Asia/Jerusalem')::date between g.from_date and g.to_date);
$function$;
revoke all on function public.change_log_hidden(text,timestamptz) from public, anon, authenticated;

create or replace function public.mgr_change_log_purge(p_token text, p_sector text, p_from date, p_to date)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_mgr uuid := public.mgr_session_manager(p_token); n int;
begin
  if p_sector is null or not (p_sector = any(public.mgr_scope_sectors(v_mgr))) then raise exception 'אין הרשאה לגזרה הזו' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'טווח תאריכים לא תקין'; end if;
  delete from public.schedule_change_log l where l.sector = p_sector and (l.at at time zone 'Asia/Jerusalem')::date between p_from and p_to;
  get diagnostics n = row_count;
  insert into public.change_log_purges (sector, from_date, to_date, by_name, removed)
  values (p_sector, p_from, p_to, (select name from public.managers where id = v_mgr), n);
  return n;
end; $function$;
revoke all on function public.mgr_change_log_purge(text,text,date,date) from public;
grant execute on function public.mgr_change_log_purge(text,text,date,date) to anon, authenticated;

create or replace function public.mgr_change_log(p_token text, p_sector text, p_days integer DEFAULT 60)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_mgr uuid := public.mgr_session_manager(p_token); v_secs text[] := public.mgr_scope_sectors(v_mgr); v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days,60),1),180));
begin
  if p_sector is null or not (p_sector = any(v_secs)) then raise exception 'אין הרשאה לגזרה הזו' using errcode = '42501'; end if;
  return jsonb_build_object('sectors', to_jsonb(v_secs), 'items', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('at', l.at, 'kind', l.kind, 'date', l.entry_date, 'shift', l.shift_type, 'worker', l.worker_name, 'detail', l.detail, 'actor', l.actor, 'auto', l.auto) x
        from public.schedule_change_log l where l.sector = p_sector and l.at >= v_from
      union all
      select jsonb_build_object('at', r.closed_at, 'kind', 'swap', 'date', r.entry_date, 'shift', r.shift_type, 'worker', w.name,
               'detail', 'הוחלף ← ' || coalesce(r.taken_by_name, ''), 'actor', case when r.resolved_by_kind = 'm' then r.resolved_by_name else coalesce(r.taken_by_name,'') || ' (לקח בעצמו)' end, 'auto', false)
        from public.swap_requests r join public.roster_workers w on w.id = r.worker_id
       where r.sector = p_sector and r.status = 'done' and r.closed_at >= v_from and not public.change_log_hidden(p_sector, r.closed_at)
      union all
      select jsonb_build_object('at', r.closed_at, 'kind', 'swap_cancel', 'date', r.entry_date, 'shift', r.shift_type, 'worker', w.name,
               'detail', 'בקשת חילוף בוטלה', 'actor', null, 'auto', false)
        from public.swap_requests r join public.roster_workers w on w.id = r.worker_id
       where r.sector = p_sector and r.status = 'cancelled' and r.closed_at >= v_from and not public.change_log_hidden(p_sector, r.closed_at)
      order by 1 desc limit 400) q), '[]'::jsonb));
end; $function$;
select 'הכל עודכן' as status;
