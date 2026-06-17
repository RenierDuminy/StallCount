create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'notification-dispatcher-every-minute'
  ) then
    perform cron.unschedule('notification-dispatcher-every-minute');
  end if;
end
$$;

select cron.schedule(
  'notification-dispatcher-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://pwpnbbqnahjyecnvedio.supabase.co/functions/v1/notification-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'notification_dispatcher_anon_key'
      ),
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'notification_dispatcher_anon_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
