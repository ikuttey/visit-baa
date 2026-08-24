drop trigger if exists operator_notifications_dispatch_email on public.operator_notifications;
drop function if exists private.dispatch_operator_notification_email();

drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;

grant update(is_read, read_at) on public.operator_notifications to authenticated;

drop policy if exists operator_notifications_update_own on public.operator_notifications;
create policy operator_notifications_update_own
on public.operator_notifications for update
to authenticated
using ((select auth.uid()) = operator_id or (select private.is_admin()))
with check ((select auth.uid()) = operator_id or (select private.is_admin()));

create or replace function public.mark_operator_notification_read(p_notification_id uuid)
returns public.operator_notifications
language plpgsql
security invoker
set search_path = ''
as $$
declare v_row public.operator_notifications;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.operator_notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = p_notification_id
    and (operator_id = auth.uid() or private.is_admin(auth.uid()))
  returning * into v_row;
  if v_row.id is null then raise exception 'Notification not found'; end if;
  return v_row;
end;
$$;
revoke all on function public.mark_operator_notification_read(uuid) from public, anon;
grant execute on function public.mark_operator_notification_read(uuid) to authenticated;

create or replace function public.mark_all_operator_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.operator_notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where operator_id = auth.uid() and not is_read;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.mark_all_operator_notifications_read() from public, anon;
grant execute on function public.mark_all_operator_notifications_read() to authenticated;

create or replace function private.dispatch_operator_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_url text; v_enabled boolean;
begin
  select edge_function_url,enabled into v_url,v_enabled
  from private.notification_delivery_config where singleton=true;
  if coalesce(v_enabled,false) and nullif(v_url,'') is not null then
    perform net.http_post(
      url := v_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('notification_id',new.id),
      timeout_milliseconds := 3000
    );
  end if;
  return new;
end;
$$;
revoke all on function private.dispatch_operator_notification_email() from public, anon, authenticated;

create trigger operator_notifications_dispatch_email
after insert on public.operator_notifications
for each row execute function private.dispatch_operator_notification_email();
