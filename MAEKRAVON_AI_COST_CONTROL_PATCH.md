# MAEKRAVON AI Cost Control Patch

This patch makes AI usage cheaper by default while preserving a deliberate higher-depth option.

## Everyday mode
- Uses `gpt-6-luna` by default.
- Sends a smaller workspace context.
- Caps output at 650 tokens.
- Intended for routine finance, CRM, and operating questions.

## Deep Analysis mode
- Uses `gpt-6.1-terra` by default.
- Sends a larger workspace context.
- Caps output at 1,400 tokens.
- Intended for harder forecasts, strategy, and detailed financial analysis.

## Optional model overrides
The Edge Function also supports Supabase secrets `OPENAI_MODEL` and `OPENAI_DEEP_MODEL` if you want to change the default model IDs later without another code patch.

## Deployment
After overlaying this patch, run `npm run build`, deploy the `maekravon-ai` Supabase Edge Function, then commit and push the frontend changes.
