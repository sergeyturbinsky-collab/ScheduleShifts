-- ===== (2026-10-25, סרגיי: "תעתיק את התהליך של קליטת עובד חדש מישראל, שיהיה בדיוק אותה רובריקה עם אותן פונקציות גם אצל אלירן ועידן")
-- קליטת עובד חדש: ישראל (קב"ט הדרכות) - כל העובדים, כמו היום. אלירן ועידן - אותו מסך ואותן פעולות, לעובדים של הגזרה שלהם.
-- הרשאה חדשה בלבד (managers.can_onboarding); שום נתון לא נמחק, ההרשאות של סרגיי לא משתנות. =====
alter table public.managers add column if not exists can_onboarding boolean not null default false;
update public.managers set can_onboarding = true where name in ('אלירן חמו', 'עידן בסעד') and not can_onboarding;

-- מי רשאי ולאילו צוותים: null = כל העובדים (ישראל); אחרת - הצוותים של הקב"ט
create or replace function public.onb_scope(p_token text)
 returns uuid[] language plpgsql stable security definer set search_path to 'public'
as $function$
declare m record;
begin
  select mg.id, mg.can_training, mg.can_onboarding, coalesce(mg.logistics_team_ids, '{}') teams into m
    from public.manager_sessions s join public.managers mg on mg.id = s.manager_id where s.token = p_token and s.expires_at > now();
  if m.id is null then raise exception 'session expired' using errcode = '28000'; end if;
  if m.can_training then return null; end if;
  if m.can_onboarding then return m.teams; end if;
  raise exception 'session expired' using errcode = '28000';
end; $function$;
revoke all on function public.onb_scope(text) from public, anon, authenticated;

create or replace function public.onb_access(p_token text)
 returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform public.onb_scope(p_token);
  return true;
exception when others then return false;
end; $function$;
revoke all on function public.onb_access(text) from public;
grant execute on function public.onb_access(text) to anon, authenticated;

create or replace function public.trn_onboarding_list(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_scope uuid[] := public.onb_scope(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'team_id', w.team_id, 'city_sectors', w.city_sectors,
      'items', coalesce((select jsonb_agg(jsonb_build_object('key', o.item_key, 'scheduled_at', o.scheduled_at, 'done', o.done, 'note', o.note))
                          from public.onboarding_items o where o.worker_id = w.id), '[]'::jsonb)) order by w.name)
    from public.roster_workers w join public.constraint_teams t on t.id = w.team_id
   where array_length(t.sectors,1) > 0 and (v_scope is null or w.team_id = any(v_scope))), '[]'::jsonb);
end; $function$;

create or replace function public.trn_onboarding_set(p_token text, p_worker_id uuid, p_item_key text, p_scheduled_at timestamp with time zone, p_done boolean, p_note text)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_scope uuid[] := public.onb_scope(p_token);
begin
  if v_scope is not null and not exists(select 1 from public.roster_workers w where w.id = p_worker_id and w.team_id = any(v_scope)) then
    raise exception 'אין הרשאה לעובד הזה' using errcode = '42501';
  end if;
  insert into public.onboarding_items (worker_id, item_key, scheduled_at, done, note, updated_at)
  values (p_worker_id, p_item_key, p_scheduled_at, coalesce(p_done, false), nullif(left(trim(coalesce(p_note,'')), 300), ''), now())
  on conflict (worker_id, item_key) do update set scheduled_at = excluded.scheduled_at, done = excluded.done, note = excluded.note, updated_at = now();
  return true;
end; $function$;

create or replace function public.trn_onboarding_complete(p_token text, p_worker_id uuid, p_done boolean)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_scope uuid[] := public.onb_scope(p_token);
begin
  if v_scope is not null and not exists(select 1 from public.roster_workers w where w.id = p_worker_id and w.team_id = any(v_scope)) then
    raise exception 'אין הרשאה לעובד הזה' using errcode = '42501';
  end if;
  insert into public.onboarding_items (worker_id, item_key, done, updated_at)
  select p_worker_id, k, coalesce(p_done, true), now() from unnest(array['general','training','kabat','moked','weapon','logistics']) k
  on conflict (worker_id, item_key) do update set done = excluded.done, updated_at = now();
  return true;
end; $function$;

select (select string_agg(name, ', ') from public.managers where can_onboarding) can_onboarding;
