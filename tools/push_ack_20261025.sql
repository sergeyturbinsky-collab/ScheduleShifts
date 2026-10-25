-- (2026-10-25, סרגיי) התראה שלא נמסרה לטלפון לפני שישי 14:00 - נשלחת שוב במוצאי שבת.
-- ומעכשיו לא מוחקים אוטומטית מכשירים שהשרת של אפל/גוגל דיווח שפגו - רק מסמנים (gone_at) ומדלגים עליהם.
-- 1) כל התראה מקבלת מפתח אישור (ack_key). כשההתראה מגיעה לטלפון, ה-service worker מדווח push_ack.
-- 2) push-send: תוקף ההתראה נגמר בשישי 14:00; אחרי צאת השבת, מה שנשלח ב-24 השעות שלפני שישי 14:00
--    ולא אושר - נשלח שוב (פעם אחת, resent_at), רק למי שיש לו מכשיר שכבר מדווח אישורים.
-- בלי מחיקת שורות ובלי שינוי נתונים קיימים - רק עמודות חדשות ופונקציה חדשה.

alter table public.push_outbox
  add column if not exists ack_key uuid default gen_random_uuid(),
  add column if not exists delivered_at timestamptz,
  add column if not exists resent_at timestamptz;
create unique index if not exists push_outbox_ack_key_idx on public.push_outbox(ack_key);

alter table public.push_subscriptions
  add column if not exists last_ack_at timestamptz,
  add column if not exists gone_at timestamptz;

create or replace function public.push_ack(p_key uuid, p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_key is null then return false; end if;
  update public.push_outbox set delivered_at = now() where ack_key = p_key and delivered_at is null;
  if coalesce(p_endpoint,'') <> '' and exists(select 1 from public.push_outbox where ack_key = p_key) then
    update public.push_subscriptions set last_ack_at = now() where endpoint = p_endpoint;
  end if;
  return true;
end; $$;
revoke all on function public.push_ack(uuid, text) from public;
grant execute on function public.push_ack(uuid, text) to anon, authenticated;

-- הרשמה מחדש של מכשיר מנקה את סימון "פג"
create or replace function public.worker_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_worker uuid;
begin
  v_worker := public.worker_session_worker(p_token);
  if coalesce(p_endpoint,'') !~ '^https://' then raise exception 'bad endpoint'; end if;
  insert into public.push_subscriptions (worker_id, manager_id, endpoint, p256dh, auth, user_agent)
  values (v_worker, null, p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua,''),300))
  on conflict (endpoint) do update set worker_id = excluded.worker_id, manager_id = null, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, gone_at = null;
  insert into public.worker_push_state (worker_id, last_reminder_at) values (v_worker, now()) on conflict (worker_id) do nothing;
  return true;
end;
$function$;

create or replace function public.manager_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_mgr uuid;
begin
  v_mgr := public.mgr_session_manager(p_token);
  if coalesce(p_endpoint,'') !~ '^https://' then raise exception 'bad endpoint'; end if;
  insert into public.push_subscriptions (worker_id, manager_id, endpoint, p256dh, auth)
  values (null, v_mgr, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set worker_id = null, manager_id = excluded.manager_id, p256dh = excluded.p256dh, auth = excluded.auth, gone_at = null;
  return true;
end;
$function$;
