-- (2026-10-29) שלב ג - להריץ רק אחרי שאפליקציית המוקד עברה לקרוא דרך app_get עם 'moked:<token>'.
-- סוגר את הקריאה הציבורית של 4 הטבלאות שהמוקד קרא ישירות לצפי המשמרת. האתר כבר קורא אותן דרך app_get.
revoke all on table public.shift_assignments from anon, authenticated;
revoke all on table public.shift_quotas from anon, authenticated;
revoke all on table public.schedule_publications from anon, authenticated;
revoke all on table public.constraint_teams from anon, authenticated;
drop policy if exists "public read access" on public.shift_assignments;
drop policy if exists "public read access" on public.shift_quotas;
drop policy if exists "read publications" on public.schedule_publications;
drop policy if exists "public read teams" on public.constraint_teams;
select 'נסגר' as status;
