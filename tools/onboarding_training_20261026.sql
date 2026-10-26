-- (2026-10-26, סרגיי: "שתחנה של ישראל תישאר כמו במקור בכלל הגזרות") - תחנת ההדרכה של ישראל חוזרת לכל גזרות המאבטחים.
create or replace function public.onb_keys_for(p_worker uuid)
 returns text[] language sql stable security definer set search_path to 'public'
as $function$
  select case when exists(select 1 from public.roster_workers w join public.constraint_teams t on t.id = w.team_id where w.id = p_worker and coalesce(array_length(t.sectors,1),0) > 0)
              then array['general','training','kabat','moked','weapon','driver','logistics','shadow1','shadow2','shadow3']
              else array['general','training','kabat','moked','weapon','logistics'] end;
$function$;
