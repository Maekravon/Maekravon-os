MAEKRAVON AI Diagnostic Patch
=============================
Purpose:
- Show the real Supabase/OpenAI error directly in MAEKRAVON AI.
- Preserve the built-in fallback analysis.
- No database migration required.
- No secrets are included.

After applying:
1. npm run build
2. Commit/push the two src files.
3. Refresh the live app and ask MAEKRAVON AI a question.
4. The fallback response will include: "Cloud AI error: ..."
