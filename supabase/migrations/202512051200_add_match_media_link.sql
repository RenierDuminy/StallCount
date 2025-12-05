-- Adds media_link metadata, normalization helper, indexes, and RLS policy adjustments for matches
set check_function_bodies = off;

alter table if exists public.matches
  add column if not exists media_link jsonb;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'media_provider'
  ) then
    alter table public.matches
      add column media_provider text generated always as (
        lower(nullif(btrim(coalesce(media_link #>> '{primary,provider}', '')), ''))
      ) stored;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'media_url'
  ) then
    alter table public.matches
      add column media_url text generated always as (
        nullif(btrim(coalesce(media_link #>> '{primary,url}', '')), '')
      ) stored;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'media_status'
  ) then
    alter table public.matches
      add column media_status text generated always as (
        nullif(btrim(coalesce(media_link #>> '{primary,status}', '')), '')
      ) stored;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'has_media'
  ) then
    alter table public.matches
      add column has_media boolean generated always as (
        nullif(btrim(coalesce(media_link #>> '{primary,url}', '')), '') is not null
      ) stored;
  end if;
end
$$;

alter table if exists public.matches
  drop constraint if exists matches_media_link_shape_chk;

alter table if exists public.matches
  add constraint matches_media_link_shape_chk check (
    media_link is null
    or (
      jsonb_typeof(media_link) = 'object'
      and jsonb_typeof(media_link -> 'primary') = 'object'
      and jsonb_typeof(media_link -> 'primary' -> 'provider') = 'string'
      and jsonb_typeof(media_link -> 'primary' -> 'url') = 'string'
      and (media_link #>> '{primary,url}') ~* '^https?:\/\/'
      and (
        not ((media_link -> 'primary') ? 'status')
        or jsonb_typeof(media_link -> 'primary' -> 'status') = 'string'
      )
      and (
        not ((media_link -> 'primary') ? 'embed_url')
        or (
          jsonb_typeof(media_link -> 'primary' -> 'embed_url') = 'string'
          and (media_link #>> '{primary,embed_url}') ~* '^https?:\/\/'
        )
      )
      and (
        not ((media_link -> 'primary') ? 'start_time')
        or jsonb_typeof(media_link -> 'primary' -> 'start_time') = 'string'
      )
      and (
        media_link -> 'vod' is null
        or jsonb_typeof(media_link -> 'vod') = 'array'
      )
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(media_link -> 'vod', '[]'::jsonb)) elem
        where not (
          jsonb_typeof(elem) = 'object'
          and jsonb_typeof(elem -> 'url') = 'string'
          and (elem ->> 'url') ~* '^https?:\/\/'
        )
      )
    )
  );

create index if not exists matches_media_provider_idx on public.matches (media_provider);
create index if not exists matches_media_status_idx on public.matches (media_status);
create index if not exists matches_media_url_idx on public.matches (media_url) where has_media;
create index if not exists matches_has_media_idx on public.matches (has_media) where has_media;

create or replace function public.normalize_match_media_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  input jsonb := new.media_link;
  normalized jsonb;
  primary_obj jsonb;
  provider text;
  url text;
  status_value text;
  embed_url text;
  youtube_id text;
  start_token text;
  start_at timestamptz;
  vod_value jsonb;
  remainder jsonb;
begin
  if input is null or jsonb_typeof(input) = 'null' then
    new.media_link := null;
    return new;
  end if;

  normalized := input;

  if jsonb_typeof(normalized) = 'string' then
    url := btrim(trim(both '"' from normalized::text));
    if url is null or url = '' then
      new.media_link := null;
      return new;
    end if;
    normalized := jsonb_build_object(
      'primary',
      jsonb_build_object('provider', 'custom', 'url', url)
    );
  end if;

  if jsonb_typeof(normalized) <> 'object' then
    new.media_link := null;
    return new;
  end if;

  primary_obj := coalesce(normalized -> 'primary', '{}'::jsonb);
  provider := lower(nullif(btrim(coalesce(primary_obj ->> 'provider', '')), ''));
  if provider is null then
    provider := 'custom';
  end if;

  url := btrim(coalesce(primary_obj ->> 'url', ''));
  if url = '' then
    new.media_link := null;
    return new;
  end if;

  status_value := nullif(btrim(coalesce(primary_obj ->> 'status', '')), '');
  if status_value is null then
    status_value := new.status;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and status_value = old.status then
    status_value := new.status;
  end if;

  start_token := nullif(btrim(coalesce(primary_obj ->> 'start_time', '')), '');
  start_at := null;
  if start_token is not null then
    begin
      start_at := start_token::timestamptz;
    exception when others then
      start_at := null;
    end;
  end if;

  if start_at is null then
    start_at := new.start_time;
  elsif tg_op = 'UPDATE' and old.start_time is distinct from new.start_time and start_at = old.start_time then
    start_at := new.start_time;
  end if;

  embed_url := nullif(btrim(coalesce(primary_obj ->> 'embed_url', '')), '');

  if provider = 'youtube' and embed_url is null then
    select substring(url from '(?:youtu\.be/|youtube\.com/(?:watch\?v=|live/|shorts/))([A-Za-z0-9_-]{6,})')
    into youtube_id;

    if youtube_id is not null then
      embed_url := format('https://www.youtube.com/embed/%s', youtube_id);
    end if;
  end if;

  vod_value := normalized -> 'vod';
  if vod_value is not null and jsonb_typeof(vod_value) = 'array' then
    vod_value := (
      select case when count(1) = 0 then null else jsonb_agg(filtered_elem) end
      from (
        select elem as filtered_elem
        from jsonb_array_elements(vod_value) elem
        where jsonb_typeof(elem) = 'object'
          and jsonb_typeof(elem -> 'url') = 'string'
          and btrim(coalesce(elem ->> 'url', '')) <> ''
      ) filtered
    );
  else
    vod_value := null;
  end if;

  primary_obj := jsonb_build_object('provider', provider, 'url', url);

  if status_value is not null then
    primary_obj := primary_obj || jsonb_build_object('status', status_value);
  end if;

  if embed_url is not null then
    primary_obj := primary_obj || jsonb_build_object('embed_url', embed_url);
  end if;

  if start_at is not null then
    primary_obj := primary_obj || jsonb_build_object('start_time', to_jsonb(start_at));
  end if;

  remainder := (normalized - 'primary') - 'vod';
  normalized := remainder || jsonb_build_object('primary', primary_obj);

  if vod_value is not null then
    normalized := normalized || jsonb_build_object('vod', vod_value);
  end if;

  new.media_link := normalized;
  return new;
end;
$$;

drop trigger if exists trg_normalize_match_media on public.matches;

create trigger trg_normalize_match_media
  before insert or update of media_link, status, start_time
  on public.matches
  for each row
  execute function public.normalize_match_media_link();

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'matches' and policyname = 'matches_staff_update_media_link'
  ) then
    alter policy matches_staff_update_media_link on public.matches
      using (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and exists (
            select 1
            from public."user" u
            join public.roles r on r.id = u.role_id
            where u.id = auth.uid()
              and r.name = any (array['admin','tournament_director','scorekeeper'])
          )
        )
      )
      with check (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and exists (
            select 1
            from public."user" u
            join public.roles r on r.id = u.role_id
            where u.id = auth.uid()
              and r.name = any (array['admin','tournament_director','scorekeeper'])
          )
        )
      );
  else
    create policy matches_staff_update_media_link on public.matches
      for update
      using (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and exists (
            select 1
            from public."user" u
            join public.roles r on r.id = u.role_id
            where u.id = auth.uid()
              and r.name = any (array['admin','tournament_director','scorekeeper'])
          )
        )
      )
      with check (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and exists (
            select 1
            from public."user" u
            join public.roles r on r.id = u.role_id
            where u.id = auth.uid()
              and r.name = any (array['admin','tournament_director','scorekeeper'])
          )
        )
      );
  end if;
end
$$;
