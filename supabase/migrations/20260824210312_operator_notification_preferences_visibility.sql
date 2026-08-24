drop policy if exists operator_notifications_select_own on public.operator_notifications;
create policy operator_notifications_select_own
on public.operator_notifications for select
to authenticated
using (
  ((select auth.uid())=operator_id and in_app_visible)
  or (select private.is_admin())
);