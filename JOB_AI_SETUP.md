# JOB AI setup

JOB AI keeps the OpenAI API key on a Supabase Edge Function. The public PWA only sends a signed-in user's request with their Supabase access token.

## Supabase

1. Run `AI_MIGRATION.sql` in the Supabase SQL editor.
2. Deploy the function from this repository with `supabase functions deploy job-ai`.
3. Set the function secrets without committing them:

```text
supabase secrets set OPENAI_API_KEY=your-key OPENAI_MODEL=your-model ALLOWED_ORIGIN=https://justineinacay.github.io
```

Use a current OpenAI model supported by the Responses API for `OPENAI_MODEL`. Keep `OPENAI_API_KEY` out of the repository and out of browser storage.

## Existing data protection

Apply the existing RLS migration before relying on cloud data privacy. The assistant uses the signed-in user's RLS-scoped rows, and only sends an allowlisted subset of dashboard fields to OpenAI.

## Local testing

The frontend is configured for the existing Supabase project and deployed site origin. Test the function locally with a Supabase session and set `ALLOWED_ORIGIN` to the local origin for that session. This change does not deploy anything automatically.
