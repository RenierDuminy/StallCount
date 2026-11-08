-- Swiss draw variants: byes, advance-or-out, tie-breaks, lagged pairing, and
-- Swiss standings feeding later brackets.
--
-- brackets.settings      per-bracket options; Swiss reads settings.swiss
--                        (mode, winsToAdvance, lossesToExit, tiebreak,
--                        marginCap, pairingLag). '{}' = the original defaults.
-- bracket_nodes.bye_team_id
--                        the team a Swiss bye slot went to. Stored so a round
--                        that has started keeps its bye if an earlier score is
--                        corrected afterwards.
-- bracket_nodes.resolve_note
--                        an informational note from the resolver shown on the
--                        game ("Bye: Team X", "Not needed this round"). Unlike
--                        last_resolve_error it is not a problem.
--
-- All three are additive and nullable/defaulted, so existing rows and the
-- current app keep working before and after this runs.

alter table public.brackets
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.bracket_nodes
  add column if not exists bye_team_id uuid references public.teams(id) on delete set null;

alter table public.bracket_nodes
  add column if not exists resolve_note text;
