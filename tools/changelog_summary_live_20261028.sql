-- ===== (2026-10-28, סרגיי: "כל שאר הדברים שממתינים לאישור - מאושר") היסטוריית שינויים בסידור לפי גזרה + סיכום בוקר לקב"טים - במערכת החיה.
-- הוכן ב-25/10 לפרויקט החדש (המעבר נדחה). רק מוסיף רישום; לא מוחק ולא משנה שום נתון. =====
create table if not exists public.schedule_change_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  sector text not null, entry_date date, shift_type text,
  actor text, kind text not null, worker_id uuid, worker_name text, detail text, auto boolean not null default false);
create index if not exists schedule_change_log_sector_idx on public.schedule_change_log (sector, at desc);
alter table public.schedule_change_log enable row level security;
revoke all on public.schedule_change_log from public, anon, authenticated;

-- מצב משבצת (לכל עובד: שעות, חניכה/חצי, תפקיד) - לפני ואחרי שמירה
create or replace function public.asg_cell_state(p_sector text, p_date date, p_shift text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(a.worker_id::text, jsonb_build_object('cs', left(a.custom_start::text,5), 'ce', left(a.custom_end::text,5),
           'sh', a.shadow_of, 'sp', coalesce(a.split,false), 'r', a.filled_role)), '{}'::jsonb)
    from public.shift_assignments a where a.sector = p_sector and a.entry_date = p_date and a.shift_type = p_shift;
$function$;

create or replace function public.asg_log_diff(p_actor text, p_sector text, p_date date, p_shift text, p_before jsonb, p_after jsonb, p_auto boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare k text; b jsonb; a jsonb; v_name text; hrs text; d text;
begin
  for k in select x from jsonb_object_keys(p_before || p_after) x loop
    b := p_before->k; a := p_after->k;
    select name into v_name from public.roster_workers where id = k::uuid;
    if b is null then
      hrs := case when a->>'cs' is not null then ' ' || (a->>'cs') || '-' || coalesce(a->>'ce','') else '' end;
      d := 'שובץ' || hrs || case when a->>'sh' is not null then case when (a->>'sp')::boolean then ' · חצי משמרת עם ' else ' · חניכה עם ' end
             || coalesce((select name from public.roster_workers where id = (a->>'sh')::uuid), '') else '' end;
      insert into public.schedule_change_log (sector, entry_date, shift_type, actor, kind, worker_id, worker_name, detail, auto)
      values (p_sector, p_date, p_shift, p_actor, 'add', k::uuid, v_name, d, p_auto);
    elsif a is null then
      insert into public.schedule_change_log (sector, entry_date, shift_type, actor, kind, worker_id, worker_name, detail, auto)
      values (p_sector, p_date, p_shift, p_actor, 'remove', k::uuid, v_name, 'הוסר מהמשמרת', p_auto);
    elsif b is distinct from a then
      d := concat_ws(' · ',
        case when (b->>'cs') is distinct from (a->>'cs') or (b->>'ce') is distinct from (a->>'ce') then
          'שעות: ' || coalesce((b->>'cs') || '-' || (b->>'ce'), 'רגילות') || ' ← ' || coalesce((a->>'cs') || '-' || (a->>'ce'), 'רגילות') end,
        case when (b->>'sh') is distinct from (a->>'sh') or (b->>'sp') is distinct from (a->>'sp') then
          case when a->>'sh' is null then 'בוטלו חניכה/חצי משמרת'
               else case when (a->>'sp')::boolean then 'חצי משמרת עם ' else 'חניכה עם ' end || coalesce((select name from public.roster_workers where id = (a->>'sh')::uuid), '') end end,
        case when (b->>'r') is distinct from (a->>'r') then 'תקן: ' || coalesce(a->>'r', 'לפי התפקיד') end);
      if coalesce(d,'') <> '' then
        insert into public.schedule_change_log (sector, entry_date, shift_type, actor, kind, worker_id, worker_name, detail, auto)
        values (p_sector, p_date, p_shift, p_actor, 'change', k::uuid, v_name, d, p_auto);
      end if;
    end if;
  end loop;
end; $function$;
revoke all on function public.asg_cell_state(text,date,text), public.asg_log_diff(text,text,date,text,jsonb,jsonb,boolean) from public, anon, authenticated;

create or replace function public.rpc_assignment_batch(p_pin text, p_ops jsonb)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare o jsonb; a jsonb; f text; n int := 0; v_ids uuid[]; c record; v_before jsonb := '{}'::jsonb; v_actor text; v_auto boolean;
begin
  if not public.verify_edit_pin(p_pin) then raise exception 'invalid pin' using errcode = '28000'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 400 then raise exception 'נתונים לא תקינים'; end if;
  v_auto := exists(select 1 from jsonb_array_elements(p_ops) x where x->'args'->>'p_method' = 'auto');
  -- (2026-10-25) מצב המשבצות לפני השמירה - בשביל היסטוריית השינויים
  for c in select distinct x->'args'->>'p_sector' s, (x->'args'->>'p_entry_date')::date d, x->'args'->>'p_shift_type' t from jsonb_array_elements(p_ops) x loop
    v_before := v_before || jsonb_build_object(c.s || '|' || c.d || '|' || c.t, public.asg_cell_state(c.s, c.d, c.t));
  end loop;
  for o in select * from jsonb_array_elements(p_ops) loop
    f := o->>'fn'; a := coalesce(o->'args', '{}'::jsonb);
    if f = 'rpc_assignment_set' then
      v_ids := case when jsonb_typeof(a->'p_worker_ids') = 'array' then array(select x::uuid from jsonb_array_elements_text(a->'p_worker_ids') x) end;
      perform public.rpc_assignment_set(p_pin, a->>'p_sector', (a->>'p_entry_date')::date, a->>'p_shift_type', v_ids, coalesce(a->>'p_method', 'manual'));
    elsif f = 'rpc_assignment_set_hours' then
      perform public.rpc_assignment_set_hours(p_pin, a->>'p_sector', (a->>'p_entry_date')::date, a->>'p_shift_type', (a->>'p_worker_id')::uuid,
                                              nullif(a->>'p_custom_start','')::time, nullif(a->>'p_custom_end','')::time);
    elsif f = 'rpc_assignment_set_role' then
      perform public.rpc_assignment_set_role(p_pin, a->>'p_sector', (a->>'p_entry_date')::date, a->>'p_shift_type', (a->>'p_worker_id')::uuid, a->>'p_role');
    elsif f = 'rpc_assignment_set_shadow' then
      perform public.rpc_assignment_set_shadow(p_pin, a->>'p_sector', (a->>'p_entry_date')::date, a->>'p_shift_type', (a->>'p_worker_id')::uuid, nullif(a->>'p_shadow_of','')::uuid);
    elsif f = 'rpc_assignment_set_split' then
      perform public.rpc_assignment_set_split(p_pin, a->>'p_sector', (a->>'p_entry_date')::date, a->>'p_shift_type', (a->>'p_worker_id')::uuid, nullif(a->>'p_split_of','')::uuid);
    else
      raise exception 'פעולה לא מוכרת: %', f;
    end if;
    n := n + 1;
  end loop;
  v_actor := public.pin_actor_name(p_pin);
  for c in select distinct x->'args'->>'p_sector' s, (x->'args'->>'p_entry_date')::date d, x->'args'->>'p_shift_type' t from jsonb_array_elements(p_ops) x loop
    perform public.asg_log_diff(v_actor, c.s, c.d, c.t, v_before->(c.s || '|' || c.d || '|' || c.t), public.asg_cell_state(c.s, c.d, c.t), v_auto);
  end loop;
  return n;
end; $function$;
grant execute on function public.rpc_assignment_batch(text,jsonb) to anon, authenticated;

-- פרסום הסידור נרשם בהיסטוריה
create or replace function public.trg_log_schedule_pub()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.schedule_change_log (sector, entry_date, actor, kind, detail)
  values (new.sector, new.period_start, new.published_by, 'publish', 'הסידור פורסם ' || to_char(new.period_start,'DD/MM') || '–' || to_char(new.period_end,'DD/MM'));
  return new;
exception when others then return new;
end; $function$;
create or replace trigger log_schedule_pub after insert or update on public.schedule_publications for each row execute function public.trg_log_schedule_pub();
create or replace function public.mgr_scope_sectors(p_mgr uuid)
 returns text[] language sql stable security definer set search_path to 'public'
as $function$
  select case when exists(select 1 from public.managers m where m.id = p_mgr and m.is_admin) or exists(select 1 from public.unit_managers u where u.manager_id = p_mgr)
              then (select array_agg(distinct s) from public.constraint_teams t, unnest(public.team_sched_sectors(t.id)) s)
              else coalesce((select array_agg(distinct s) from unnest(public.mgr_scope_team_ids(p_mgr)) tid, unnest(public.team_sched_sectors(tid)) s), '{}') end;
$function$;
revoke all on function public.mgr_scope_sectors(uuid) from public, anon, authenticated;

-- רשימה לעמוד "היסטוריית החלפות ושינויים": לפי גזרה, חדש לישן. כולל החלפות שבוצעו ובקשות שבוטלו.
create or replace function public.mgr_change_log(p_token text, p_sector text, p_days integer default 60)
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
       where r.sector = p_sector and r.status = 'done' and r.closed_at >= v_from
      union all
      select jsonb_build_object('at', r.closed_at, 'kind', 'swap_cancel', 'date', r.entry_date, 'shift', r.shift_type, 'worker', w.name,
               'detail', 'בקשת חילוף בוטלה', 'actor', null, 'auto', false)
        from public.swap_requests r join public.roster_workers w on w.id = r.worker_id
       where r.sector = p_sector and r.status = 'cancelled' and r.closed_at >= v_from
      order by 1 desc limit 400) q), '[]'::jsonb));
end; $function$;
grant execute on function public.mgr_change_log(text,text,integer) to anon, authenticated;

create or replace function public.mgr_scope_sector_list(p_token text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select to_jsonb(coalesce(public.mgr_scope_sectors(public.mgr_session_manager(p_token)), '{}'));
$function$;
grant execute on function public.mgr_scope_sector_list(text) to anon, authenticated;

-- ---------- 6. תזכורת פוש למשמרת ----------
-- בוקר: 21:00 בערב שלפני. ערב: 08:00 באותו יום. לילה: 15:30 באותו יום. רק בסידור שפורסם, ולמי שהפעיל התראות.
create or replace function public.mgr_daily_summary(p_mgr uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_all boolean; v_teams uuid[]; v_secs text[]; v_today date := (now() at time zone 'Asia/Jerusalem')::date; r jsonb;
begin
  v_all := exists(select 1 from public.managers m where m.id = p_mgr and m.is_admin) or exists(select 1 from public.unit_managers u where u.manager_id = p_mgr);
  v_teams := case when v_all then (select array_agg(id) from public.constraint_teams) else public.mgr_scope_team_ids(p_mgr) end;
  v_secs := public.mgr_scope_sectors(p_mgr);
  select jsonb_build_object(
    'swaps', (select count(*) from public.swap_requests s join public.roster_workers w on w.id = s.worker_id where s.status = 'open' and s.entry_date >= v_today and w.team_id = any(v_teams)),
    'today_shifts', (select count(*) from public.shift_assignments a where a.sector = any(v_secs) and a.entry_date = v_today),
    'equip_waiting', (select count(*) from public.worker_equipment e join public.roster_workers w on w.id = e.worker_id where e.waiting and w.team_id = any(v_teams)),
    'equip_requests', (select count(*) from public.equipment_requests q where q.status = 'pending' and q.team_id = any(v_teams)),
    'admin_requests', (select count(*) from public.admin_requests q where q.status = 'pending' and q.team_id = any(v_teams)),
    'locked', (select count(*) from public.roster_workers w where w.team_id = any(v_teams) and public.worker_lock_until(w.id) is not null),
    'not_submitted', (select count(*) from public.roster_workers w join public.constraint_teams t on t.id = w.team_id
        where w.team_id = any(v_teams)
          and not exists(select 1 from public.constraint_submissions cs where cs.worker_id = w.id and cs.period_start =
               case when t.cadence = 'biweekly' then date '2026-01-04' + ((floor(((v_today - extract(dow from v_today)::int) - date '2026-01-04')::numeric / 14)::int + 1) * 14)
                    else (v_today - extract(dow from v_today)::int) + 7 end)),
    'todos_today', (select count(*) from public.mgr_todos t where t.manager_id = p_mgr and t.done_at is null and t.removed_at is null and t.due_date <= v_today)
  ) into r;
  return r;
end; $function$;
revoke all on function public.mgr_daily_summary(uuid) from public, anon, authenticated;

create or replace function public.mgr_daily_summary_get(p_token text)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$ select public.mgr_daily_summary(public.mgr_session_manager(p_token)); $function$;
grant execute on function public.mgr_daily_summary_get(text) to anon, authenticated;

create table if not exists public.daily_summary_log (manager_id uuid not null, day date not null, sent_at timestamptz not null default now(), primary key (manager_id, day));
alter table public.daily_summary_log enable row level security;
revoke all on public.daily_summary_log from public, anon, authenticated;

create or replace function public.daily_summary_due()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_now timestamp := now() at time zone 'Asia/Jerusalem'; m record; s jsonb; txt text; n int := 0;
begin
  if v_now::time < time '07:30' or v_now::time >= time '10:30' then return 0; end if;
  if extract(dow from v_now) = 6 then return 0; end if; -- בשבת אין סיכום (ההתראות מוחזקות עד מוצאי שבת)
  for m in select distinct p.manager_id id from public.push_subscriptions p where p.manager_id is not null
             and not exists(select 1 from public.daily_summary_log l where l.manager_id = p.manager_id and l.day = v_now::date) loop
    s := public.mgr_daily_summary(m.id);
    txt := concat_ws(' · ',
      case when (s->>'today_shifts')::int > 0 then '👥 ' || (s->>'today_shifts') || ' משובצים היום' end,
      case when (s->>'swaps')::int > 0 then '🔁 ' || (s->>'swaps') || ' חילופים פתוחים' end,
      case when (s->>'not_submitted')::int > 0 then '📝 ' || (s->>'not_submitted') || ' לא הגישו אילוצים' end,
      case when (s->>'equip_requests')::int > 0 then '🎒 ' || (s->>'equip_requests') || ' בקשות ציוד' end,
      case when (s->>'equip_waiting')::int > 0 then '⏳ ' || (s->>'equip_waiting') || ' פריטים ממתינים' end,
      case when (s->>'admin_requests')::int > 0 then '📄 ' || (s->>'admin_requests') || ' בקשות מנהלתיות' end,
      case when (s->>'locked')::int > 0 then '🔒 ' || (s->>'locked') || ' נעולים' end,
      case when (s->>'todos_today')::int > 0 then '📌 ' || (s->>'todos_today') || ' משימות להיום' end);
    insert into public.daily_summary_log (manager_id, day) values (m.id, v_now::date) on conflict do nothing;
    if coalesce(txt, '') <> '' then
      insert into public.push_outbox (manager_id, title, body, url, tag) values (m.id, '☀️ סיכום בוקר', left(txt, 230), './', 'daily-' || v_now::date);
      n := n + 1;
    end if;
  end loop;
  return n;
end; $function$;
revoke all on function public.daily_summary_due() from public, anon, authenticated;

-- הרצה כל דקה (כמו שליחת ההתראות)
select cron.schedule('ops-daily-summary', '*/5 * * * *', 'select public.daily_summary_due()') where not exists(select 1 from cron.job where jobname='ops-daily-summary');
select 'עודכן' as status;
