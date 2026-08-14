-- Allow team-scoped captains / team managers to manage their own team's roster.
--
-- Context: team_user_roles scopes roles like captain and team_manager to a
-- specific team. The existing team_roster policies resolve permissions through
-- user_roles / event_user_roles only, so a captain whose grant lives in
-- team_user_roles is rejected with a row-level security error.
--
-- These policies are ADDITIVE. Postgres ORs multiple permissive policies for
-- the same command, so the existing tournament-director / admin policies keep
-- working untouched. Nothing here needs to be dropped or replaced.

-- Does the current user hold one of the given permissions for this team?
-- Matched on team AND event so a captain of one team cannot edit another.
-- A grant with a null event_id applies to that team in every event.
create or replace function public.has_team_roster_access(
  target_team_id  uuid,
  target_event_id uuid,
  required_keys   text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_user_roles tur
    join public.role_permissions rp on rp.role_id = tur.role_id
    join public.permissions p       on p.id = rp.permission_id
    where tur.user_id = auth.uid()
      and tur.team_id = target_team_id
      and (tur.event_id is null or tur.event_id = target_event_id)
      and p.key = any (required_keys)
  );
$$;

comment on function public.has_team_roster_access(uuid, uuid, text[]) is
  'True when the calling user holds any of the given permission keys for the team via team_user_roles. Used by team_roster RLS policies.';

revoke all on function public.has_team_roster_access(uuid, uuid, text[]) from public;
grant execute on function public.has_team_roster_access(uuid, uuid, text[]) to authenticated;

-- INSERT: the new row must belong to a team the user manages.
drop policy if exists "team_roster_insert_team_scoped" on public.team_roster;
create policy "team_roster_insert_team_scoped"
  on public.team_roster
  for insert
  to authenticated
  with check (
    public.has_team_roster_access(team_id, event_id, array['roster_insert'])
  );

-- UPDATE: both the existing row and the resulting row must stay within a team
-- the user manages, so a roster entry cannot be moved to another team.
drop policy if exists "team_roster_update_team_scoped" on public.team_roster;
create policy "team_roster_update_team_scoped"
  on public.team_roster
  for update
  to authenticated
  using (
    public.has_team_roster_access(team_id, event_id, array['roster_update'])
  )
  with check (
    public.has_team_roster_access(team_id, event_id, array['roster_update'])
  );

-- DELETE: the row must belong to a team the user manages.
drop policy if exists "team_roster_delete_team_scoped" on public.team_roster;
create policy "team_roster_delete_team_scoped"
  on public.team_roster
  for delete
  to authenticated
  using (
    public.has_team_roster_access(team_id, event_id, array['roster_delete'])
  );
