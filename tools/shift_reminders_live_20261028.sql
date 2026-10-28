-- ===== (2026-10-28) תזכורות לפני משמרת - במערכת החיה.
-- סוכם ב-25/10: משמרת בוקר - תזכורת ב-21:00 בערב שלפני; ערב - ב-08:00; לילה - ב-15:30. (מתואמת 11:00 = כמו בוקר.)
-- זה הוכן אז רק בפרויקט החדש (שההעברה אליו נדחתה) ולכן לא רץ במערכת החיה - תוקן עכשיו. לא נמחק שום נתון. =====
create or replace function public.shift_label_he(p text)
 returns text language sql immutable
as $function$
  select case p when 'morning' then 'בוקר' when 'evening' then 'ערב' when 'night' then 'לילה' when 'friday_morning' then 'שישי בוקר'
    when 'friday_night' then 'שישי לילה' when 'motzash' then 'מוצ"ש' when 'combined' then 'משמרת' when 'coordinated' then 'מתואמת' else p end;
$function$;

create table if not exists public.shift_reminder_log (worker_id uuid not null, sector text not null, entry_date date not null, shift_type text not null,
  sent_at timestamptz not null default now(), primary key (worker_id, sector, entry_date, shift_type));
alter table public.shift_reminder_log enable row level security;
revoke all on public.shift_reminder_log from public, anon, authenticated;

create or replace function public.shift_reminder_kind(p_shift text, p_start time)
 returns text language sql immutable
as $function$
  select case when p_shift in ('morning','friday_morning') then 'morning'
              when p_shift in ('evening','motzash','combined') then 'evening'
              when p_shift in ('night','friday_night') then 'night'
              when p_start is null then 'morning'
              when p_start < time '12:00' then 'morning'
              when p_start < time '19:00' then 'evening'
              else 'night' end;
$function$;

create or replace function public.in_shabbat_hold(t timestamp)
 returns boolean language sql immutable
as $function$ select (extract(dow from t) = 5 and t::time >= time '14:00') or (extract(dow from t) = 6 and t::time < time '21:00'); $function$;
create or replace function public.shabbat_hold_end(t timestamp)
 returns timestamp language sql immutable
as $function$ select case when extract(dow from t) = 5 then (t::date + 1) + time '21:00' else t::date + time '21:00' end; $function$;

create or replace function public.shift_reminders_due()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_now timestamp := now() at time zone 'Asia/Jerusalem'; n int;
begin
  with c as (
    select a.worker_id, a.sector, a.entry_date, a.shift_type, a.custom_start,
           lower(public.assignment_interval(a.sector, a.entry_date, a.shift_type, a.custom_start, a.custom_end)) st
      from public.shift_assignments a
     where a.entry_date between v_now::date and v_now::date + 1
       and exists(select 1 from public.schedule_publications p where p.sector = a.sector and a.entry_date between p.period_start and p.period_end)
       and exists(select 1 from public.push_subscriptions s where s.worker_id = a.worker_id and s.gone_at is null)
  ), d as (
    select c.*, public.shift_reminder_kind(c.shift_type, (c.st at time zone 'Asia/Jerusalem')::time) k from c
  ), due as (
    select d.*, case d.k when 'morning' then (d.entry_date - 1) + time '21:00' when 'evening' then d.entry_date + time '08:00' else d.entry_date + time '15:30' end due_at from d
  ), go as (
    insert into public.shift_reminder_log (worker_id, sector, entry_date, shift_type)
    select worker_id, sector, entry_date, shift_type from due
     where v_now >= due_at and v_now < due_at + interval '3 hours' and (st is null or st > now())
       and not (public.in_shabbat_hold(due_at) and st is not null and (st at time zone 'Asia/Jerusalem') < public.shabbat_hold_end(due_at))
    on conflict do nothing
    returning worker_id, sector, entry_date, shift_type
  )
  insert into public.push_outbox (worker_id, title, body, url, tag)
  select g.worker_id, '⏰ תזכורת למשמרת',
         case when g.entry_date = v_now::date then 'היום' else 'מחר' end || ' — משמרת ' || public.shift_label_he(g.shift_type)
           || case when g.shift_type in ('motzash') or u.st is null then '' else ' מ-' || to_char(u.st at time zone 'Asia/Jerusalem', 'HH24:MI') end
           || ' · ' || g.sector,
         './', 'shiftrem-' || g.entry_date || '-' || g.shift_type
    from go g left join due u on u.worker_id = g.worker_id and u.sector = g.sector and u.entry_date = g.entry_date and u.shift_type = g.shift_type;
  get diagnostics n = row_count;
  return n;
end; $function$;
revoke all on function public.shift_reminders_due() from public, anon, authenticated;

select cron.schedule('ops-shift-reminders', '* * * * *', 'select public.shift_reminders_due()') where not exists(select 1 from cron.job where jobname = 'ops-shift-reminders');
select 'עודכן' as status;
