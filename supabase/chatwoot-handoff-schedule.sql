-- Run after deploying the routing-tick endpoint. Change the origin for a
-- separate environment. Re-running cron.schedule updates the named job.
create extension if not exists pg_cron;
create extension if not exists http with schema extensions;

select cron.schedule('supportos-chatwoot-handoff', '30 seconds', $job$
  do $tick$
  declare
    auth_header text;
    response_status integer;
  begin
    select 'Bearer ' || router.schedule_key into auth_header
    from public.supportos_chatwoot_router_state router
    where router.id = 'main' and exists (
      select 1 from public.supportos_chatwoot_presence presence
      where presence.handoff_since is not null
        or (presence.offline_since is null and presence.heartbeat_at <= now() - interval '90 seconds')
    );
    if auth_header is null then return; end if;

    perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '3000');
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
    select response.status into response_status
    from extensions.http(row(
      'POST', 'https://support-os-psi.vercel.app/api/chatwoot?action=routing-tick',
      array[extensions.http_header('Authorization', auth_header)], 'application/json', '{}'
    )::extensions.http_request) response;
    if response_status <> 200 then
      raise exception 'SupportOS routing scheduler returned HTTP %', response_status;
    end if;
  end;
  $tick$;
$job$);
