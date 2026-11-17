# MAEKRAVON buyer-readiness repair audit

Review branch: `repair/buyer-readiness-20261116`

## Verified on 2026-11-16

- Supabase project was reported as `ACTIVE_HEALTHY`.
- Nine Edge Functions were `ACTIVE`.
- Health advisor returned no findings.
- Security advisor reported 11 authenticated-executable `SECURITY DEFINER` functions needing authorization review, five RLS-on/no-policy tables (possibly intentionally backend-only), and disabled leaked-password protection.
- A Nov. 13 request to `mk3-executive-ai` failed because Gemini returned 404 for `gemini-2.5-flash`, then a later request returned HTTP 200. This does not prove that all AI interactions currently work.
- The deployed `mk3-billing` source intentionally gates one-time checkout behind configured Stripe secrets, price identifiers, valid `APP_ORIGIN`, and `MK3_ENABLE_ONE_TIME_CHECKOUT=true`. An HTTP 200 status response means the endpoint is callable, **not** that checkout is enabled.
- The deployed `mk3-integrations` source lists OAuth providers and flags unconfigured provider credentials. Inactive connector buttons may therefore be expected until credentials are configured.
- GitHub `main` did not include the new MK3 backend source although Supabase has newer deployed MK3 functions. Do not overwrite or redeploy production from the old repository until reconciled.

## Changes on this branch

1. Validate the frontend Supabase project URL before initialization, including invalid-origin and path configurations.
2. Show an actionable missing-key/origin message on the login screen.
3. Add GitHub Actions PR checks for dependency installation, TypeScript/Vite build and output presence.
4. Warn when deployed MK3 source is absent from the repository. This is intentionally a **warning** so that a repair branch does not disable existing frontend builds.

## Still required before a buyer demo or production merge

- Reconcile current Chromebook local code, the Cloudflare deployment source, and GitHub `main`.
- Run PR build checks and an interactive login / logout / workspace-creation smoke test.
- Verify AI model against the project's available Gemini models and test the full flow with a signed-in account.
- Configure Stripe only in a controlled test environment; test webhook signature verification and successful entitlement fulfillment.
- Review each flagged privileged RPC's use and permissions before altering grants. Some are deliberately authenticated and check the active user.
- Enable leaked-password protection in Supabase Auth if available for the plan; verify the Auth policies afterwards.
- Run cross-workspace RLS tests with two dedicated test users.
- Confirm the correct app origin for provider OAuth and test redirects with an authorized account.
- Protect secrets and verify tracked source contains no production keys.

No production migration, secret, checkout or customer record is changed by this PR. Supabase deployed functions are not modified by this branch.
