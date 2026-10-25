-- ===== (2026-10-25, סרגיי) תגובה של הקב"ט לבקשה - בלי קשר לאישור/דחייה/ניפוק:
-- בקשות ציוד (equipment), בקשות מנהלתיות - חופשה/מילואים/מחלה (admin), בקשות חילוף (swap).
-- טבלה חדשה בלבד; לא משנה ולא מוחק שום נתון קיים. העובד מקבל התראה ורואה את התגובה ליד הבקשה. =====
create table if not exists public.request_replies (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('equipment','admin','swap')),
  request_id uuid not null,
  worker_id uuid not null,
  manager_id uuid references public.managers(id) on delete set null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now());
create index if not exists request_replies_req_idx on public.request_replies (kind, request_id, created_at);
create index if not exists request_replies_worker_idx on public.request_replies (worker_id, created_at desc);
alter table public.request_replies enable row level security;
revoke all on public.request_replies from public, anon, authenticated;

-- הבקשה שייכת לתחום של המנהל? מחזיר את העובד של הבקשה (null = אין הרשאה / לא נמצאה)
create or replace function public.req_reply_target(p_mgr uuid, p_kind text, p_id uuid)
 returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_admin boolean; v_teams uuid[]; v_all boolean; w uuid;
begin
  select m.is_admin, coalesce(m.logistics_team_ids, '{}') into v_admin, v_teams from public.managers m where m.id = p_mgr;
  if v_admin is null then return null; end if;
  if p_kind = 'equipment' then
    select r.worker_id into w from public.equipment_requests r where r.id = p_id and (v_admin or r.team_id = any(v_teams));
  elsif p_kind = 'admin' then
    select r.worker_id into w from public.admin_requests r where r.id = p_id and (v_admin or r.team_id = any(v_teams));
  elsif p_kind = 'swap' then
    v_all := v_admin or exists(select 1 from public.unit_managers u where u.manager_id = p_mgr);
    select r.worker_id into w from public.swap_requests r join public.roster_workers rw on rw.id = r.worker_id
     where r.id = p_id and (v_all or rw.team_id = any(public.mgr_scope_team_ids(p_mgr)));
  end if;
  return w;
end; $function$;
revoke all on function public.req_reply_target(uuid,text,uuid) from public, anon, authenticated;

create or replace function public.mgr_request_reply(p_token text, p_kind text, p_id uuid, p_body text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_mgr uuid := public.mgr_session_manager(p_token); v_name text; w uuid; v_body text := left(nullif(btrim(coalesce(p_body,'')),''), 1000); x public.request_replies; v_what text;
begin
  if v_body is null then raise exception 'כתבו תגובה'; end if;
  w := public.req_reply_target(v_mgr, p_kind, p_id);
  if w is null then raise exception 'הבקשה לא נמצאה' using errcode = '42501'; end if;
  select name into v_name from public.managers where id = v_mgr;
  insert into public.request_replies (kind, request_id, worker_id, manager_id, author_name, body) values (p_kind, p_id, w, v_mgr, v_name, v_body) returning * into x;
  v_what := case p_kind when 'equipment' then 'לבקשת הציוד' when 'admin' then (select 'לבקשה ל' || public.areq_kind_he(kind) from public.admin_requests where id = p_id) else 'לבקשת החילוף' end;
  insert into public.push_outbox (worker_id, title, body, url, tag)
  select w, '💬 תגובה ' || coalesce(v_what, 'לבקשה שלך'), coalesce(v_name || ': ', '') || left(v_body, 200), './', 'reply-' || p_id
   where exists(select 1 from public.push_subscriptions s where s.worker_id = w);
  return jsonb_build_object('id', x.id, 'kind', x.kind, 'request_id', x.request_id, 'author_name', x.author_name, 'body', x.body, 'created_at', x.created_at);
end; $function$;
revoke all on function public.mgr_request_reply(text,text,uuid,text) from public;
grant execute on function public.mgr_request_reply(text,text,uuid,text) to anon, authenticated;

-- כל התגובות מסוג מסוים בתחום של המנהל (לתצוגה ליד הבקשות)
create or replace function public.mgr_request_replies(p_token text, p_kind text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_mgr uuid := public.mgr_session_manager(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'request_id', x.request_id, 'author_name', x.author_name, 'body', x.body, 'created_at', x.created_at) order by x.created_at)
    from public.request_replies x where x.kind = p_kind and x.created_at > now() - interval '400 days'
     and public.req_reply_target(v_mgr, x.kind, x.request_id) is not null), '[]'::jsonb);
end; $function$;
revoke all on function public.mgr_request_replies(text,text) from public;
grant execute on function public.mgr_request_replies(text,text) to anon, authenticated;

-- התגובות לבקשות של העובד עצמו
create or replace function public.worker_request_replies(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_w uuid := public.worker_session_worker(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'request_id', x.request_id, 'author_name', x.author_name, 'body', x.body, 'created_at', x.created_at) order by x.created_at)
    from public.request_replies x where x.worker_id = v_w and x.created_at > now() - interval '400 days'), '[]'::jsonb);
end; $function$;
revoke all on function public.worker_request_replies(text) from public;
grant execute on function public.worker_request_replies(text) to anon, authenticated;

select 'עודכן' as status;
