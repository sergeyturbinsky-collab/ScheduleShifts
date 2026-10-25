-- ===== (2026-10-25, סרגיי) קליטת עובד חדש - התחנות הסופיות לחיפה (אלירן): שיחה כללית, נהלים והכרת הגזרה, מוקד ומכשירים,
-- חתימה על נשק, פתיחת תיק נהג + תדריך בטיחות, ציוד לוגיסטי, חפיפה + יציאה לשטח ×3 (תאריך ביצוע + חונך לכל משמרת).
-- "✔ בוצע" מסמן את התחנות של הגזרה של העובד. לא נמחק שום נתון. =====
create or replace function public.onb_keys_for(p_worker uuid)
 returns text[] language sql stable security definer set search_path to 'public'
as $function$
  select case when exists(select 1 from public.roster_workers w join public.constraint_teams t on t.id = w.team_id where w.id = p_worker and 'חיפה' = any(t.sectors))
              then array['general','kabat','moked','weapon','driver','logistics','shadow1','shadow2','shadow3']
              else array['general','training','kabat','moked','weapon','logistics'] end;
$function$;
revoke all on function public.onb_keys_for(uuid) from public, anon, authenticated;

create or replace function public.trn_onboarding_complete(p_token text, p_worker_id uuid, p_done boolean)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v_scope uuid[] := public.onb_scope(p_token);
begin
  if v_scope is not null and not exists(select 1 from public.roster_workers w where w.id = p_worker_id and w.team_id = any(v_scope)) then
    raise exception 'אין הרשאה לעובד הזה' using errcode = '42501';
  end if;
  insert into public.onboarding_items (worker_id, item_key, done, updated_at)
  select p_worker_id, k, coalesce(p_done, true), now() from unnest(public.onb_keys_for(p_worker_id)) k
  on conflict (worker_id, item_key) do update set done = excluded.done, updated_at = now();
  return true;
end; $function$;
select 'עודכן' as status;
