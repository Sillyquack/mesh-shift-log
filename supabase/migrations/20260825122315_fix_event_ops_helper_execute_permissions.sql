-- Phase 10X removed PUBLIC execution from these helpers, but authenticated
-- Event Operations RLS policies invoke them directly. Restore only the
-- authenticated execution required for those policies; row access remains
-- governed by the helpers and the existing RLS policy predicates.
grant execute on function public.current_user_can_manage_event_ops()
  to authenticated;
grant execute on function public.same_event_ops_organization(uuid)
  to authenticated;
grant execute on function public.event_ops_event_belongs_to_current_org(uuid)
  to authenticated;
