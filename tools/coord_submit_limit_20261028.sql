-- (הוחל במערכת החיה 2026-10-28; נבדק בבדיקה עם ביטול)
-- (2026-10-28, סרגיי: "מהסידור הבא - תגביל הגשה ל-2 משמרות מתואמות בלבד (08.11 ואילך)") - הגנה גם בשרת, מעבר לטופס
create or replace function public.trg_coord_submit_limit()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_period date; v_sun date; n int;
begin
  if new.shift_type <> 'coordinated' then return new; end if;
  select period_start into v_period from public.constraint_submissions where id = new.submission_id;
  if v_period is null or v_period < date '2026-11-08' then return new; end if;
  v_sun := new.entry_date - extract(dow from new.entry_date)::int;
  select count(*) into n from public.constraint_entries e
   where e.submission_id = new.submission_id and e.shift_type = 'coordinated' and e.entry_date between v_sun and v_sun + 6
     and e.entry_date <> new.entry_date;
  if n >= 2 then
    raise exception 'אפשר לסמן משמרת מתואמת (11:00-23:00) עד 2 פעמים בשבוע' using errcode = 'P0001';
  end if;
  return new;
end; $function$;
create or replace trigger coord_submit_limit before insert on public.constraint_entries for each row execute function public.trg_coord_submit_limit();
