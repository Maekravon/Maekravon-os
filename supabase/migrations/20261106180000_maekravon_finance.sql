-- MAEKRAVON Launch Patch 1.0: business finance ledger.
-- Additive migration. Existing CRM, workspace, team, and automation data are preserved.

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(14,2) not null check (amount >= 0),
  category text not null default 'Uncategorized',
  description text not null default '',
  transaction_date date not null default current_date,
  recurring boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'import', 'bank', 'invoice')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, legacy_id)
);

create index if not exists finance_transactions_workspace_date_idx
  on public.finance_transactions (workspace_id, transaction_date desc, created_at desc);
create index if not exists finance_transactions_workspace_kind_idx
  on public.finance_transactions (workspace_id, kind, transaction_date desc);

alter table public.finance_transactions enable row level security;

revoke all on public.finance_transactions from public, anon;
grant select, insert, update, delete on public.finance_transactions to authenticated;

drop policy if exists "Members can view finance transactions" on public.finance_transactions;
create policy "Members can view finance transactions"
on public.finance_transactions for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

drop policy if exists "Managers can create finance transactions" on public.finance_transactions;
create policy "Managers can create finance transactions"
on public.finance_transactions for insert to authenticated
with check (
  (select public.has_workspace_role(workspace_id, array['owner','admin','manager']::text[]))
  and created_by = (select auth.uid())
);

drop policy if exists "Managers can update finance transactions" on public.finance_transactions;
create policy "Managers can update finance transactions"
on public.finance_transactions for update to authenticated
using ((select public.has_workspace_role(workspace_id, array['owner','admin','manager']::text[])))
with check ((select public.has_workspace_role(workspace_id, array['owner','admin','manager']::text[])));

drop policy if exists "Admins can delete finance transactions" on public.finance_transactions;
create policy "Admins can delete finance transactions"
on public.finance_transactions for delete to authenticated
using ((select public.has_workspace_role(workspace_id, array['owner','admin']::text[])));
