create or replace function public.enqueue_live_event_from_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_code text;
  payload jsonb;
  match_rec record;
  match_label text;
  team_label text;
  human_event text;
begin
  select code into event_code
  from public.match_events
  where id = new.event_type_id;

  if event_code is null then
    return new;
  end if;

  select
    m.id,
    m.event_id,
    m.division_id,
    m.team_a,
    m.team_b,
    m.start_time,
    ta.name as team_a_name,
    tb.name as team_b_name,
    ev.name as event_name,
    d.name as division_name
  into match_rec
  from public.matches m
  left join public.teams ta on ta.id = m.team_a
  left join public.teams tb on tb.id = m.team_b
  left join public.events ev on ev.id = m.event_id
  left join public.divisions d on d.id = m.division_id
  where m.id = new.match_id;

  match_label := coalesce(nullif(match_rec.team_a_name, ''), 'Team A')
    || ' vs '
    || coalesce(nullif(match_rec.team_b_name, ''), 'Team B');

  if match_label is null or match_label = ' vs ' then
    match_label := coalesce(new.match_id::text, 'Match');
  end if;

  if new.team_id is not null then
    if new.team_id = match_rec.team_a then
      team_label := coalesce(nullif(match_rec.team_a_name, ''), 'Team A');
    elsif new.team_id = match_rec.team_b then
      team_label := coalesce(nullif(match_rec.team_b_name, ''), 'Team B');
    else
      select name into team_label
      from public.teams
      where id = new.team_id;
    end if;
  end if;

  human_event := initcap(replace(event_code, '_', ' '));

  payload := jsonb_build_object(
    'log_id', new.id,
    'match_id', new.match_id,
    'event_id', match_rec.event_id,
    'division_id', match_rec.division_id,
    'team_id', new.team_id,
    'player_id', new.actor_id,
    'secondary_player_id', new.secondary_actor_id,
    'abba_line', new.abba_line,
    'match_start_time', match_rec.start_time,
    'match_name', match_label,
    'division_name', match_rec.division_name,
    'team_name', team_label,
    'target_name', coalesce(team_label, match_label),
    'title', human_event || ' · ' || coalesce(team_label, match_label),
    'body', format('New %s event for %s', human_event, coalesce(team_label, match_label)),
    'url', format('/matches/%s', new.match_id)
  );

  insert into public.live_events (match_id, event_type, data)
  values (new.match_id, event_code, payload);

  return new;
end;
$$;
