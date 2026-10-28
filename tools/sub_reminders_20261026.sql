-- (הוחל במערכת החיה 2026-10-28, באישור סרגיי)
-- ===== (2026-10-26, סרגיי) תזכורות הגשת סידור עבודה - מאבטחי חיפה:
-- "להגיש סידור עבודה עד יום רביעי בשעה 12:00. למי שלא הגיש - תזכורת ביום ראשון ב-16:00, ביום שני ב-20:00 וביום רביעי ב-08:00.
--  עד שהמאבטח יגיש או המערכת תינעל, המוקדם מבין השניים. הקב"ט וסרגיי צריכים לראות לפי שמות שההתראה אכן הגיעה."
-- מופעל לפי צוות (constraint_teams.sub_reminders) - כרגע רק הצוות של חיפה. לא נמחק ולא משתנה שום נתון קיים. =====
alter table public.constraint_teams add column if not exists sub_reminders boolean not null default false;
update public.constraint_teams set sub_reminders = true where 'חיפה' = any(sectors) and not sub_reminders;

create table if not exists public.sub_reminder_log (
  worker_id uuid not null,
  period_start date not null,
  slot text not null,            -- sun16 / mon20 / wed08
  outbox_id bigint,              -- null = לא נשלח (אין התראות פעילות במכשיר)
  created_at timestamptz not null default now(),
  primary key (worker_id, period_start, slot));
alter table public.sub_reminder_log enable row level security;
revoke all on public.sub_reminder_log from public, anon, authenticated;

-- זמני התזכורות של השבוע הנוכחי (שעון ישראל): ראשון 16:00, שני 20:00, רביעי 08:00
create or replace function public.sub_reminder_slots(p_sunday date)
 returns table(slot text, at_local timestamp, label text) language sql immutable
as $function$
  values ('sun16', p_sunday + time '16:00', 'ראשון 16:00'),
         ('mon20', (p_sunday + 1) + time '20:00', 'שני 20:00'),
         ('wed08', (p_sunday + 3) + time '08:00', 'רביעי 08:00');
$function$;

-- רץ כל 5 דקות: שולח את התזכורת שהגיע זמנה (עד 3 שעות אחרי) למי שעדיין לא הגיש לשבוע הבא, כל עוד ההגשה לא ננעלה
create or replace function public.sub_reminders_due()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_now timestamp := now() at time zone 'Asia/Jerusalem'; v_sun date; t record; s record; v_period date; v_lock timestamp; w record; v_id bigint; n int := 0;
begin
  v_sun := v_now::date - extract(dow from v_now)::int;
  for t in select * from public.constraint_teams where sub_reminders and coalesce(cadence,'weekly') = 'weekly' and coalesce(array_length(sectors,1),0) > 0 loop
    v_period := v_sun + 7;
    v_lock := (v_sun + coalesce(t.close_weekday, 3)) + coalesce(nullif(t.close_time,''), '12:00')::time;
    if v_now >= v_lock then continue; end if;
    for s in select * from public.sub_reminder_slots(v_sun) loop
      if not (v_now >= s.at_local and v_now < s.at_local + interval '3 hours' and s.at_local < v_lock) then continue; end if;
      for w in select rw.id from public.roster_workers rw
                where rw.team_id = t.id
                  and not exists(select 1 from public.constraint_submissions cs where cs.worker_id = rw.id and cs.period_start = v_period)
                  and not exists(select 1 from public.sub_reminder_log l where l.worker_id = rw.id and l.period_start = v_period and l.slot = s.slot) loop
        v_id := null;
        if exists(select 1 from public.push_subscriptions ps where ps.worker_id = w.id and ps.gone_at is null) then
          insert into public.push_outbox (worker_id, title, body, url, tag)
          values (w.id, '📝 תזכורת: הגשת סידור עבודה',
                  'עוד לא הגשת סידור לשבוע ' || to_char(v_period,'DD/MM') || '–' || to_char(v_period + 6,'DD/MM') || '. ההגשה פתוחה עד יום ' ||
                  (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[coalesce(t.close_weekday,3)+1] || ' ב-' || to_char(v_lock,'HH24:MI') || '.',
                  './', 'subrem-' || v_period)
          returning id into v_id;
        end if;
        insert into public.sub_reminder_log (worker_id, period_start, slot, outbox_id) values (w.id, v_period, s.slot, v_id) on conflict do nothing;
        n := n + 1;
      end loop;
    end loop;
  end loop;
  return n;
end; $function$;
revoke all on function public.sub_reminders_due() from public, anon, authenticated;

-- לקב"ט (הצוותים שלו) ולסרגיי (הכל): לכל מאבטח - הגיש? ולכל תזכורת - נשלחה / הגיעה לטלפון / אין התראות במכשיר
create or replace function public.mgr_sub_reminder_status(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_mgr uuid := public.mgr_session_manager(p_token); v_all boolean; v_teams uuid[];
        v_now timestamp := now() at time zone 'Asia/Jerusalem'; v_sun date; v_period date;
begin
  v_all := exists(select 1 from public.managers m where m.id = v_mgr and m.is_admin);
  v_teams := case when v_all then (select array_agg(id) from public.constraint_teams) else public.mgr_scope_team_ids(v_mgr) end;
  v_sun := v_now::date - extract(dow from v_now)::int;
  v_period := v_sun + 7;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'team', t.name, 'team_id', t.id, 'period_start', v_period,
      'lock_at', (v_sun + coalesce(t.close_weekday,3)) + coalesce(nullif(t.close_time,''),'12:00')::time,
      'locked', v_now >= (v_sun + coalesce(t.close_weekday,3)) + coalesce(nullif(t.close_time,''),'12:00')::time,
      'slots', (select jsonb_agg(jsonb_build_object('slot', s.slot, 'label', s.label, 'at', s.at_local, 'past', v_now >= s.at_local)) from public.sub_reminder_slots(v_sun) s),
      'workers', coalesce((select jsonb_agg(jsonb_build_object('id', rw.id, 'name', rw.name,
          'submitted_at', (select cs.created_at from public.constraint_submissions cs where cs.worker_id = rw.id and cs.period_start = v_period limit 1),
          'push', exists(select 1 from public.push_subscriptions ps where ps.worker_id = rw.id and ps.gone_at is null),
          'reminders', coalesce((select jsonb_object_agg(l.slot, jsonb_build_object('at', l.created_at, 'sent_at', o.sent_at, 'delivered_at', o.delivered_at, 'no_push', l.outbox_id is null))
                                 from public.sub_reminder_log l left join public.push_outbox o on o.id = l.outbox_id
                                where l.worker_id = rw.id and l.period_start = v_period), '{}'::jsonb)) order by rw.name)
          from public.roster_workers rw where rw.team_id = t.id), '[]'::jsonb)) order by t.sort_order)
    from public.constraint_teams t where t.sub_reminders and t.id = any(v_teams)), '[]'::jsonb);
end; $function$;
revoke all on function public.mgr_sub_reminder_status(text) from public;
grant execute on function public.mgr_sub_reminder_status(text) to anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'ops-sub-reminders';
select cron.schedule('ops-sub-reminders', '*/5 * * * *', 'select public.sub_reminders_due()');
select 'עודכן' as status;
