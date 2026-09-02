begin;

-- A cancelled address keeps its original invitation row and delivery history.
-- Reopening it is therefore a lifecycle event, not a duplicate invitation.
alter table public.lab_admin_invitation_events
  drop constraint if exists lab_admin_invitation_events_action_check;

alter table public.lab_admin_invitation_events
  add constraint lab_admin_invitation_events_action_check
  check (action in ('imported', 'invited', 'resent', 'accepted', 'revoked', 'restored', 'bounced'));

commit;
