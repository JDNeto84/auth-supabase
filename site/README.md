# Static Supabase Auth Demo

Local static site demonstrating Sign Up, Sign In and Profile using Supabase (email/password).

Quick start

1. Open `site/index.html` in a browser, or serve the `site/` folder locally:

```bash
python3 -m http.server 8000 --directory site
# then open http://localhost:8000
```

2. Provide your `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the "Configurar Supabase" section on the sign in page and click "Salvar". Keys can be obtained from your Supabase project settings (public anon key).

3. Use "Criar conta" to sign up, then sign in. After successful sign-in you will be redirected to `profile.html`.

Notes

- This is a static demo and stores the public anon key in localStorage for convenience; do not store service_role keys here.
- The script tries to read a `users` table on the project to enrich profile data; ensure the table exists or that cross-table queries are permitted.
- For production, use a secure backend to handle secrets and server-side logic.
