# MAEKRAVON OS
### CONTROL EVERYTHING.

MAEKRAVON OS is a cloud-connected business workspace built with React, TypeScript, Vite, and Supabase.

## Features

- Supabase authentication and workspace access
- Cloud-synchronized CRM leads and activity history
- Follow-up tasks and appointments
- Workspace preferences and automation settings
- Team invitations and role management
- Workspace notifications
- Responsive business dashboard

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A configured Supabase project

## Local development

Install dependencies:

    npm install

Create your local environment file:

    cp .env.example .env.local

Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.

Start the application:

    npm run dev

## Production build

    npm run build

The production frontend is generated in dist/.

## Supabase

Project reference: fkhyovnpgyshscbbgige

Database migrations:

    supabase/migrations/

Team management function:

    supabase/functions/manage-members/

Check migration status:

    npx supabase migration list --remote

Deploy the team management function:

    npx supabase functions deploy manage-members --use-api

## Security

- Never commit .env.local.
- Never expose a Supabase service-role key in frontend code.
- Protect database access with correctly configured Row Level Security.
- Store private credentials in secure environment variables.

## Production launch checklist

- Configure permanent HTTPS hosting.
- Configure Supabase authentication redirect URLs.
- Configure verified custom SMTP for invitation emails.
- Test account creation, login, invitations, and mobile access.

---

MAEKRAVON OS | CONTROL EVERYTHING.
