-- NEXORA SaaS team invitations, notifications, and server-side automation.
-- Additive migration. Existing CRM/workspace records are not deleted.

alter table public.workspace_members add column if not exists email text;

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','manager','member')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references auth.users(id),
  invited_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  accepted_at timestamptz
);
create index if not exists workspace_invitations_workspace_status_idx
  on public.workspace_invitations(workspace_id, status, created_at desc);
create unique index if not exists workspace_invitations_pending_email_uidx
  on public.workspace_invitations(workspace_id, lower(email)) where status = 'pending';

alter table public.workspace_invitations enable row level security;
grant select on public.workspace_invitations to authenticated;
drop policy if exists "Workspace members and invitees can view invitations" on public.workspace_invitations;
create policy "Workspace members and invitees can view invitations"
  on public.workspace_invitations for select to authenticated
  using (public.is_workspace_member(workspace_id) or invited_user_id = auth.uid());

create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  target_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (workspace_id, user_id, dedupe_key)
);
create index if not exists workspace_notifications_user_created_idx
  on public.workspace_notifications(user_id, created_at desc);
alter table public.workspace_notifications enable row level security;
grant select on public.workspace_notifications to authenticated;
drop policy if exists "Members can view their own workspace notifications" on public.workspace_notifications;
create policy "Members can view their own workspace notifications"
  on public.workspace_notifications for select to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create or replace function public.mark_workspace_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.workspace_notifications
     set read_at = now()
   where id = p_notification_id
     and user_id = auth.uid()
     and public.is_workspace_member(workspace_id);
end;
$$;
revoke all on function public.mark_workspace_notification_read(uuid) from public, anon;
grant execute on function public.mark_workspace_notification_read(uuid) to authenticated;

create or replace function public.accept_my_workspace_invitation()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_invitation public.workspace_invitations%rowtype;
  v_name text;
begin
  if auth.uid() is null then
    return null;
  end if;

  select lower(u.email), coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1))
    into v_email, v_name
    from auth.users u
   where u.id = auth.uid();

  if v_email is null then
    return null;
  end if;

  select * into v_invitation
    from public.workspace_invitations
   where invited_user_id = auth.uid()
     and lower(email) = v_email
     and status = 'pending'
     and expires_at > now()
   order by created_at desc
   limit 1
   for update;

  if not found then
    return null;
  end if;

  insert into public.workspace_members(workspace_id, user_id, full_name, role, email)
  values (v_invitation.workspace_id, auth.uid(), v_name, v_invitation.role, v_email)
  on conflict (workspace_id, user_id) do update
    set email = excluded.email;

  update public.workspace_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_invitation.id;

  return v_invitation.workspace_id;
end;
$$;
revoke all on function public.accept_my_workspace_invitation() from public, anon;
grant execute on function public.accept_my_workspace_invitation() to authenticated;

-- Server-side follow-up creation. The unique workspace/legacy_id constraint
-- makes retries safe and prevents browser-side duplicate task creation.
create or replace function public.nexora_create_new_lead_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  select coalesce(new_lead_task, true) into v_enabled
    from public.workspace_automation_settings
   where workspace_id = new.workspace_id;
  if coalesce(v_enabled, true) then
    insert into public.follow_up_tasks(workspace_id, legacy_id, lead_id, title, due_date, priority, done)
    values (new.workspace_id, 'AUTO-NEW-' || new.id::text, new.id,
            'Contact ' || new.name, current_date, 'High', false)
    on conflict (workspace_id, legacy_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists nexora_new_lead_followup on public.leads;
create trigger nexora_new_lead_followup
after insert on public.leads
for each row execute function public.nexora_create_new_lead_followup();

create or replace function public.nexora_create_qualified_lead_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if new.status = 'Qualified' and old.status is distinct from new.status then
    select coalesce(qualified_task, true) into v_enabled
      from public.workspace_automation_settings
     where workspace_id = new.workspace_id;
    if coalesce(v_enabled, true) then
      insert into public.follow_up_tasks(workspace_id, legacy_id, lead_id, title, due_date, priority, done)
      values (new.workspace_id, 'AUTO-QUALIFIED-' || new.id::text, new.id,
              'Prepare proposal for ' || new.name, current_date, 'High', false)
      on conflict (workspace_id, legacy_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nexora_qualified_lead_followup on public.leads;
create trigger nexora_qualified_lead_followup
after update of status on public.leads
for each row execute function public.nexora_create_qualified_lead_followup();

-- In-app reminders are generated every 15 minutes. Each reminder is deduped
-- per user and task/day; no email or SMS is sent by this migration.
create or replace function public.nexora_process_workspace_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row_count integer := 0;
begin
  update public.workspace_invitations
     set status = 'expired'
   where status = 'pending' and expires_at <= now();

  insert into public.workspace_notifications(workspace_id, user_id, kind, title, body, target_id, dedupe_key)
  select t.workspace_id, m.user_id, 'follow_up_due', 'Follow-up due', t.title,
         t.id, 'followup:' || t.id::text || ':' || ((now() at time zone coalesce(ws.timezone, 'UTC'))::date)::text
    from public.follow_up_tasks t
    join public.workspace_members m on m.workspace_id = t.workspace_id
    left join public.workspace_settings ws on ws.workspace_id = t.workspace_id
   where not t.done
     and t.due_date <= (now() at time zone coalesce(ws.timezone, 'UTC'))::date
  on conflict (workspace_id, user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;

  insert into public.workspace_notifications(workspace_id, user_id, kind, title, body, target_id, dedupe_key)
  select a.workspace_id, m.user_id, 'appointment_upcoming', 'Upcoming appointment',
         a.title || ' · ' || to_char(a.appointment_date, 'Mon DD') || ' at ' || to_char(a.appointment_time, 'HH12:MI AM'),
         a.id, 'appointment:' || a.id::text || ':' || a.appointment_date::text || ':' || a.appointment_time::text
    from public.appointments a
    join public.workspace_members m on m.workspace_id = a.workspace_id
    left join public.workspace_settings ws on ws.workspace_id = a.workspace_id
   where not a.done
     and (a.appointment_date + a.appointment_time) >= (now() at time zone coalesce(ws.timezone, 'UTC'))
     and (a.appointment_date + a.appointment_time) <= (now() at time zone coalesce(ws.timezone, 'UTC')) + interval '24 hours'
  on conflict (workspace_id, user_id, dedupe_key) do nothing;
  get diagnostics v_row_count = row_count;
  v_count := v_count + v_row_count;
  return v_count;
end;
$$;
revoke all on function public.nexora_process_workspace_notifications() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'nexora-workspace-notifications' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'nexora-workspace-notifications',
    '*/15 * * * *',
    'select public.nexora_process_workspace_notifications();'
  );
end;
$$;
