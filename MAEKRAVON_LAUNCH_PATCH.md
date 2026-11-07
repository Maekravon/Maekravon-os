# MAEKRAVON Launch Patch 1.0

This patch changes MAEKRAVON from a CRM-heavy prototype into a business finance + growth operating system foundation.

## What changed

### 1. CRM deletion is complete
The contact profile now includes a destructive Delete Lead action. It deletes the Supabase lead first, then removes the local CRM record and related local follow-up/appointment references. Supabase foreign-key cascades handle related cloud records.

### 2. Finance is now real workspace data
A new `finance_transactions` table stores income and expenses separately from CRM opportunity values. The Finance screen now supports manual transaction entry, recurring expense flags, expense category pressure, month income, month expenses, net cash flow, recorded net movement, and a recent transaction ledger.

### 3. Command Center is finance-aware
Once finance data exists, the dashboard shows month net cash flow and a financial pulse instead of pretending Won CRM deal value is cash.

### 4. MAEKRAVON AI is now an actual copilot architecture
The frontend sends authorized workspace context to the `maekravon-ai` Supabase Edge Function. The Edge Function verifies workspace access and can call OpenAI securely using a server-side secret. If that service is not configured, the app falls back to deterministic workspace analysis.

### 5. Launch polish
Prototype wording was reduced, server-backed automation wording was corrected, cloud status messaging is more honest, note sync copy is accurate, and backup exports now include finance data.

## Files added

- `src/finance.ts`
- `src/ai.ts`
- `supabase/migrations/20261106180000_maekravon_finance.sql`
- `supabase/functions/maekravon-ai/index.ts`

## Files upgraded

- `src/App.tsx`
- `src/cloudLeads.ts`
- `src/styles.css`
- `README.md`
- `package.json`
- `package-lock.json`

## Validation performed

The source passed TypeScript syntax transpilation and a semantic check using local module stubs. The sandbox could not complete `npm ci` because package downloads timed out, so the exact Vite production bundle must still be run in the user's existing Chromebook project where dependencies have previously installed successfully.
