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
