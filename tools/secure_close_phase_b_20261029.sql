-- (2026-10-29) הוחל במערכת החיה. שלב ב: הטבלאות שהמוקד לא קורא - סגורות לקריאה/כתיבה ישירה מהאתר.
-- האתר קורא דרך app_get (עם זיהוי). הטבלאות שהמוקד קורא - נשארו לקריאה בלבד (בלי הרשאות כתיבה) עד שלב ג.
revoke all on table public.constraint_entries from anon, authenticated;
revoke all on table public.constraint_submissions from anon, authenticated;
revoke all on table public.constraint_exceptions from anon, authenticated;
revoke all on table public.logistics_items from anon, authenticated;
revoke all on table public.schedule_tasks from anon, authenticated;
drop policy if exists "public read entries" on public.constraint_entries;
drop policy if exists "public read submissions" on public.constraint_submissions;
drop policy if exists "public read access" on public.constraint_exceptions;
drop policy if exists "read logistics items" on public.logistics_items;
revoke all on function public.schedule_original(text[], date, date) from public, anon, authenticated;
revoke all on function public.swap_history(text[], date, date) from public, anon, authenticated;
revoke all on function public.sched_task_rows_list(text[], date, date) from public, anon, authenticated;
revoke all on table public.shift_assignments from anon, authenticated;
revoke all on table public.shift_quotas from anon, authenticated;
revoke all on table public.schedule_publications from anon, authenticated;
revoke all on table public.constraint_teams from anon, authenticated;
grant select on table public.shift_assignments to anon, authenticated;
grant select on table public.shift_quotas to anon, authenticated;
grant select on table public.schedule_publications to anon, authenticated;
grant select on table public.constraint_teams to anon, authenticated;
-- תיקיית האחסון site (קובץ ישן מ-06/09) - הפכה לפרטית (לא נמחקה): update storage.buckets set public = false where id = 'site';
