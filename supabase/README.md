# Family Wall — Supabase setup

The Family Wall keeps posts, members and photos in a Supabase project. The family tree itself
never leaves the owner's computer.

## One-time setup (about 10 minutes)

1. **Create the project** at supabase.com: Free plan, region **Sydney**.
2. **Add two GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - `SUPABASE_URL` — the Project URL from the project's **Connect** dialog
   - `SUPABASE_PUBLISHABLE_KEY` — the publishable key (`sb_publishable_…`)
3. **Create the wall's tables and privacy rules:** Supabase → **SQL Editor** → **New query** →
   paste all of [`migrations/0001_family_wall.sql`](migrations/0001_family_wall.sql) → **Run**.
   It's safe to run again.
4. **Where the confirmation link goes:** Authentication → **URL Configuration** →
   Site URL: `https://github.com/Casey-OC/familytree/releases`
5. **Let people type a code instead of clicking a link (recommended):** Authentication →
   **Emails** → **Confirm signup** → add this line to the message body:
   `Or type this code in the Family Tree app: {{ .Token }}`

Then build installers (Actions → Build installers → Run workflow). The wall switches on
automatically in builds made after the secrets exist.

## Testing the privacy rules

`tests/run_tests.py` runs 39 checks against a local PostgreSQL with a small stand-in for
Supabase's auth and storage:

```
python3 supabase/tests/run_tests.py -h <host> -p <port> -U postgres
```
