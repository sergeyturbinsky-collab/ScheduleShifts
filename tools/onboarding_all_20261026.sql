-- ===== (2026-10-26, סרגיי: "תעתיק את האיזור האישי של אלירן גם לעידן, אביחי ודניאל. שיהיו זהים")
-- קליטת עובד חדש: גם אביחי ודניאל (עידן ואלירן כבר), כל אחד לעובדים שלו. התחנות של חיפה - בכל גזרות המאבטחים.
-- לא נמחק שום נתון; ההרשאות של סרגיי לא משתנות. =====
update public.managers set can_onboarding = true where name in ('אביחי קדוש', 'דניאל כתב') and not can_onboarding;
create or replace function public.onb_keys_for(p_worker uuid)
 returns text[] language sql stable security definer set search_path to 'public'
as $function$
  select case when exists(select 1 from public.roster_workers w join public.constraint_teams t on t.id = w.team_id where w.id = p_worker and coalesce(array_length(t.sectors,1),0) > 0)
              then array['general','kabat','moked','weapon','driver','logistics','shadow1','shadow2','shadow3']
              else array['general','training','kabat','moked','weapon','logistics'] end;
$function$;
select (select string_agg(name, ', ') from public.managers where can_onboarding) can_onboarding;
