# MAEKRAVON OS
### CONTROL EVERYTHING.

MAEKRAVON OS is a cloud-connected business operating system built with React, TypeScript, Vite, Supabase, and an optional OpenAI-powered business copilot.

## Launch Patch 1.0 capabilities

- Supabase authentication and multi-user workspace access
- Cloud CRM with lead profiles, activity history, status pipeline, and permanent owner/admin deletion
- Follow-up tasks, appointments, team invitations, roles, and notifications
- Server-backed new-lead and qualified-lead follow-up automation
- Business finance ledger with income, expenses, recurring costs, categories, and cash-flow summaries
- Command Center financial pulse that keeps CRM deal values separate from recorded cash activity
- MAEKRAVON AI business finance and growth copilot
- Built-in local analysis fallback when the AI Edge Function or API key is unavailable
- Responsive desktop/mobile workspace
- Full workspace backup export including finance records

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A configured Supabase project

## Local development

Install dependencies:

    npm install

Create your local environment file and configure:

    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...

Start the application:

    npm run dev

Production build:

    npm run build

## Supabase launch upgrade

The Launch Patch adds this migration:

    supabase/migrations/20261106180000_maekravon_finance.sql

Apply pending migrations:

    npx supabase db push

Deploy Edge Functions:

    npx supabase functions deploy manage-members
    npx supabase functions deploy maekravon-ai

### Enable live MAEKRAVON AI

The browser never receives the OpenAI API key. Configure it only as a Supabase Edge Function secret.

Required secret:

    OPENAI_API_KEY

Optional model override:

    OPENAI_MODEL

If no OpenAI key is configured, MAEKRAVON automatically falls back to built-in analysis of the current workspace instead of breaking the assistant screen.

## Finance data model

The current Finance module is a workspace ledger, not a bank reconciliation engine. It knows only the income and expenses recorded in MAEKRAVON. CRM deal values are deliberately kept separate from financial transactions.

The `source` field is already designed for future providers:

- `manual`
- `import`
- `bank`
- `invoice`

That gives the next phase a clean path to bank, accounting, and invoice integrations without replacing the Finance UI.

## Security

- Never commit `.env.local`.
- Never put an OpenAI API key or Supabase service-role key in frontend code.
- Financial data is protected by workspace-aware Row Level Security.
- Finance reads are workspace-member scoped.
- Finance creation/update is limited to owner/admin/manager roles.
- Finance deletion is limited to owners/admins.
- MAEKRAVON AI verifies workspace membership before using supplied workspace context.

## Production launch checklist

- Apply the finance migration.
- Deploy `manage-members` and `maekravon-ai` Edge Functions.
- Configure `OPENAI_API_KEY` in Supabase if live generative AI is desired.
- Configure the production HTTPS URL in Supabase Auth Site URL and Redirect URLs.
- Update the invitation application URL secret from localhost to the production URL.
- Configure verified custom SMTP for branded authentication/invitation emails.
- Test account creation, login, lead create/edit/delete, finance create/delete, team invitations, notifications, and mobile access.
- Add a custom domain and final legal/privacy/terms copy before public marketing.

---

MAEKRAVON OS | CONTROL EVERYTHING.
