# DEPLOY_GUIDE.md: deploying Comps to Railway

Operating instructions for Claude Code (and humans) to ship the `pranav-dev` branch to the live Railway app.
Read `CLAUDE.md` first. This guide is subordinate to it, to `docs/SPEC.md`, and to `supabase/migrations/`.

**Live app:** https://comps-production-1543.up.railway.app
**Repo:** https://github.com/yashkhadilkar/comps (Yash's repo; Pranav works on `pranav-dev`)
**Deploy mechanism:** Railway auto-deploys from `main`. Build is `npm run build`, start is `npm start` (one service, Node 22, see `engines` in `package.json`). There is no `railway.json`, Dockerfile, or Procfile, so Railway uses its default Node detection.

> **Merging to `main` IS the production deploy.** `CLAUDE.md` section 3 forbids pushing or merging to `main` without explicit user approval. Claude must stop and ask at every step marked **[APPROVAL]**.

---

## 0. State of things when this was written (2026-10-21)

- `origin/main` is at "README: live URL, clone URL, team steps" (Step 1 only: auth, schema, placeholder agent route, stubs).
- `pranav-dev` is **31 commits ahead and 0 behind** `origin/main`, so the merge is a clean fast-forward. It contains the agent (Step 2), usage limits and Stripe (Step 3), UI rebuild, research history, the analyst "Why?" driver analysis, and threads/continuation.
- Production Supabase has `001_init.sql` applied (shared team project). **`002_add_threads.sql` is probably NOT applied to production.** Verify, do not assume (section 3).
- Production Stripe has no webhook endpoint yet (BIG_AUDIT A13 pending list).
- Production env vars are unknown to Claude. Section 2 lists what must exist.

Re-verify all of this with `git fetch origin && git rev-list --left-right --count origin/main...pranav-dev` before acting; it may have changed.

---

## 1. The order matters

```
1. Pre-flight (local green, clean diff, no secrets)        <- Claude
2. Railway env vars complete                               <- Yash (Railway access)
3. Supabase migration 002 applied to the PROD database     <- Yash/Pranav (SQL editor)  MUST precede step 4
4. Merge pranav-dev -> main (triggers deploy)              <- Claude, after [APPROVAL]
5. Stripe dashboard webhook endpoint for the Railway URL   <- Yash/Pranav (Stripe dashboard)
6. Post-deploy smoke tests on the live URL                 <- Claude + human browser
7. Update docs/BIG_AUDIT.md, commit                        <- Claude
```

Step 3 before step 4 is not optional. See section 3 for why.

---

## 2. Environment variables on Railway

Set in Railway: service, **Variables**. Names come from `.env.example`; Claude must never print, paste, or commit values.

| Variable | Production value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | shared team Supabase project URL | **Inlined into the client bundle at build time.** Must exist before the build runs. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | Same: build-time. |
| `SUPABASE_SECRET_KEY` | Supabase secret key | Server only. Bypasses RLS. Never `NEXT_PUBLIC_`. |
| `ANTHROPIC_API_KEY` | Anthropic key | |
| `LLM_MODEL` | `claude-sonnet-5-5` for the demo (`claude-haiku-5-5` is cheaper for dev) | Behavior was verified mostly on Haiku; Sonnet is unverified (BIG_AUDIT A10 risks). |
| `TAVILY_API_KEY` | Tavily key | News search tool. |
| `SEC_USER_AGENT` | `Name email@domain` | SEC rejects requests without a name and email. |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `lib/stripe.ts` throws on anything not starting `sk_test_` (PAY-001). |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from the **dashboard endpoint** (section 5) | The local `stripe listen` secret will NOT work on Railway. |
| `NEXT_PUBLIC_APP_URL` | `https://comps-production-1543.up.railway.app` | No trailing slash needed (stripped). **Not** localhost, or Stripe redirects users to localhost. |
| `UNLIMITED_USER_EMAILS` | **leave unset** | Test-account limit bypass. Setting it in production disables limits for those emails. |

Claude cannot read Railway's variables unless the Railway CLI is installed and logged in. If `railway` is unavailable, ask Yash to confirm the list above. If it is available, `railway variables` prints values, so pipe through something that shows names only (for example `railway variables --kv | cut -d= -f1`). Never show values.

Changing a `NEXT_PUBLIC_*` variable requires a **redeploy/rebuild**, not just a restart.

---

## 3. Database: apply migration 002 to production FIRST

Migrations in `supabase/migrations/`:

| File | Purpose | Applied to prod? |
|---|---|---|
| `001_init.sql` | `profiles`, `runs`, RLS, signup trigger | Yes (Step 1, per README) |
| `002_add_threads.sql` | `threads` table, nullable `runs.thread_id`, backfill one thread per existing run, RLS | **Verify** |

### Why this must precede the merge

The new `/api/agent` inserts runs with a `thread_id` column ([app/api/agent/route.ts](../app/api/agent/route.ts), [lib/threads.ts](../lib/threads.ts)). If the column or `threads` table is missing in production:
- run persistence is best-effort, so the user still sees an answer but **no `runs` row is saved**,
- usage limits count `runs` rows with `status = 'success'` ([lib/usage.ts](../lib/usage.ts)), so **Free users would never hit the 3-question limit** and Pro's daily limit would never trigger,
- History and sidebar threads would be empty or erroring.

This silently breaks billing semantics, so it must be avoided, not cleaned up afterward.

### How to check whether it is applied

Supabase dashboard, SQL Editor (read-only check):

```sql
select
  to_regclass('public.threads') is not null as threads_table,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'runs' and column_name = 'thread_id') as runs_thread_id;
```

Both must be `true`. If both are `true`, skip the rest of this section.

### How to apply

Migrations are applied by hand in the Supabase SQL Editor (there is no migration runner in this repo).

1. **Back up first.** Export `profiles` and `runs` as CSV (Table Editor, Export). Backups from 2026-10-20 sit in `supabase/` as `profiles-backup-oct20.csv` and `runs-backup-oct20.csv`. Take a fresh one if there has been activity since. **These files contain real user emails. They are untracked and must never be committed** (section 6).
2. Open the SQL Editor on the **production** project (confirm the project URL matches `NEXT_PUBLIC_SUPABASE_URL` in Railway, not a personal dev project).
3. Paste the full contents of `supabase/migrations/002_add_threads.sql` and run it.
4. The script is one transaction, safe to re-run, locks `runs` briefly, backfills one thread per existing run, and **aborts and rolls back** if run/success/failure counts change or any run is left without a thread. A clean run means it passed its own self-check.
5. Re-run the check query above. Both columns `true`.
6. Do not edit `001_init.sql` or `002_add_threads.sql` after they are applied (`CLAUDE.md` section 4). Schema changes need a new `003_` file.

Old deployed code keeps working against the migrated schema (`thread_id` is nullable), so applying 002 before the merge is safe.

---

## 4. Pre-flight and merge

### 4.1 Pre-flight (Claude, on `pranav-dev`)

Show before anything else, per `CLAUDE.md` section 3:

```bash
git status --short
git branch --show-current
git fetch origin
git rev-list --left-right --count origin/main...pranav-dev   # expect "0 N"; if the left number is non-zero, main moved, stop and tell the user
```

Untracked files seen at the time of writing, each needing a decision from the user, not a blanket `git add .`:

| File | Action |
|---|---|
| `supabase/profiles-backup-oct20.csv`, `supabase/runs-backup-oct20.csv` | **Never commit.** Contain user emails/data. Move out of the repo or add to `.gitignore`. |
| `README_FIRST.md` | Describes the docs pack; ask the user whether to commit. |
| `docs/RESEARCH_HISTORY_PLAN.md` | Plan doc; ask the user whether to commit. |
| `docs/DEPLOY_GUIDE.md` | This file; commit if the user wants it on `main`. |

Then the gates (all must pass; do not lower thresholds to pass):

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

Offline regression scripts are listed in `docs/BIG_AUDIT.md` (A10 lists the suites and how to run them, e.g. `npx tsx scripts/try-stripe.ts`, `try-threads.ts`, `try-driver.ts`, usage needs `NODE_OPTIONS=--conditions=react-server`). Run at least the Stripe, usage, threads, history, and stream suites. Report failures verbatim.

Secret scan of what will ship:

```bash
git diff origin/main...pranav-dev --stat
git diff origin/main...pranav-dev | grep -nE "sk_(test|live)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|sb_secret_|sk-ant-" || echo "no secrets found"
git ls-files | grep -E "^\.env" # must print only .env.example
```

### 4.2 Merge **[APPROVAL REQUIRED]**

Stop and ask the user, stating: the commit count, that this triggers a production deploy, that migration 002 is confirmed applied (section 3), and that Railway env vars are confirmed (section 2). Only after an explicit yes:

```bash
git push origin pranav-dev              # branch push is not a deploy; fine once approved
git checkout main
git pull --ff-only origin main
git merge --ff-only pranav-dev          # fast-forward only; if it refuses, STOP
git push origin main                    # THIS DEPLOYS
git checkout pranav-dev
```

Alternative, if Yash wants review: open a PR `pranav-dev` to `main` with `gh pr create` and let Yash merge it. PR bodies end with the attribution line required by the session instructions.

Never `--force` push `main`.

### 4.3 Watch the deploy

Railway dashboard, service, **Deployments**: the build runs `npm run build`, then `npm start`. If the Railway CLI is available, `railway logs`. Typical build failure causes: a missing `NEXT_PUBLIC_SUPABASE_*` variable, a Node version other than 22, or a type error not caught locally (run `npm ci && npm run build` locally first).

**Rollback:** in Railway, Deployments, redeploy the previous successful deployment (instant, no git change needed). To undo in git, `git revert` the merge commit on `main` (new commit, push after approval). Do not rewrite history. Migration 002 does not need rollback: the old code ignores the new column and table.

---

## 5. Stripe webhook for production

Local `stripe listen` only forwards to localhost. Without a dashboard endpoint, payments succeed in Stripe but **the plan never flips to Pro** (this is exactly what happened locally on 2026-10-21 when the forwarder was not running; BIG_AUDIT A13).

In the Stripe dashboard (**Test mode / sandbox** only; PAY-001 refuses live keys):

1. Developers, Webhooks, **Add endpoint**.
2. URL: `https://comps-production-1543.up.railway.app/api/stripe/webhook`
3. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded` (both are handled in [lib/billing.ts](../lib/billing.ts)).
4. Save, then copy the endpoint's **Signing secret** (`whsec_...`) into Railway as `STRIPE_WEBHOOK_SECRET`.
5. Redeploy or restart the service so it picks up the variable.
6. The Stripe account must be the same one whose `sk_test_` key is in Railway; endpoints are per account.

Quick check without paying: send a test event or resend a past one from the dashboard (Webhooks, endpoint, Send test webhook). A bad or missing signature must return 400; a valid signature on a non-matching session returns 200 `ignored`.

If a payment was made before the endpoint existed, resend its event from the dashboard (Events, `checkout.session.completed`, Resend). The handler is idempotent, so a repeat is harmless.

---

## 6. Post-deploy smoke tests (live URL)

Claude can check the unauthenticated ones with `curl`; the rest need a person in a browser (Claude has no logged-in session). Record results honestly in BIG_AUDIT, and mark browser checks "NOT RUN" if nobody ran them.

Unauthenticated (curl):

```bash
URL=https://comps-production-1543.up.railway.app
curl -s -o /dev/null -w "%{http_code}\n" $URL/login                                      # 200
curl -s -o /dev/null -w "%{http_code}\n" $URL/pricing                                    # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/agent -d '{}'                  # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/checkout                       # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/stripe/webhook -d '{}'         # 400 (missing signature)
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/stripe/webhook -H "stripe-signature: t=1,v1=bad" -d '{}'   # 400 (invalid signature)
```

A 500 from the webhook with no signature means `STRIPE_WEBHOOK_SECRET` is unset on Railway.

Browser (human, with a **fresh test account**, not one of the team's real accounts):

1. Sign up, log in, ask a question; the trace streams, the answer is cited, and the question appears under Recent research and History.
2. Ask until the Free limit (3). The 4th is refused with the upgrade panel (HTTP 402). If it is NOT refused, migration 002 or run persistence is broken: stop and investigate before anything else.
3. Click Upgrade to Pro, pay with `4242 4242 4242 4242` (any future date, any CVC). Redirect returns to `/pricing?checkout=success`, which shows "Confirming your upgrade", then flips to "Upgrade complete" within about 30 seconds.
4. Reload and log out/in: plan stays Pro. The top-right badge shows Pro.
5. Cancel path: start checkout, go back; plan stays Free and the page says checkout cancelled.
6. Run the primary demo question on the production model (`LLM_MODEL`), and record the wall-clock time (target under 60 s).
7. Follow-up question within a thread continues the same thread.

If step 3 hangs on "Confirming", check Stripe, Webhooks, the endpoint's recent deliveries and their response codes: 400 means wrong `STRIPE_WEBHOOK_SECRET`, 500 means env or DB trouble, no deliveries means wrong URL or events not selected.

---

## 7. After deploying

- Update `docs/BIG_AUDIT.md` (`CLAUDE.md` section 5, step 8): what shipped, commit SHA deployed, migration 002 applied (date, by whom), tests run, which A13 pending items are now closed, which were not run, remaining risks.
- Tick the relevant boxes in `docs/step3-plan.md` and `docs/step5-plan.md` ("Correct commit is deployed") only for checks that actually passed.
- Commit the doc updates on `pranav-dev`; they reach `main` with the next merge (another approval).
- Tell Yash which commit is live and that `main` and `pranav-dev` are now identical.

---

## 8. Known gotchas

- **Merge = deploy.** Never push to `main` casually, never from a stale checkout.
- **Migration before code** (section 3). Reversing the order silently disables usage limits.
- **`NEXT_PUBLIC_*` are build-time.** Fix them, then rebuild.
- **Webhook secret differs per source:** CLI `stripe listen` secret (local only) vs dashboard endpoint secret (Railway). Mixing them returns 400 on every event.
- **Stripe is test-mode only** by design (PAY-001).
- **In-memory SEC cache** resets on every deploy/restart; the first request after a deploy is slower (SPEC section on caching).
- **`maxDuration = 120` is only a hint** on Railway; the agent loop enforces its own 90 s / 115 s limits.
- **Duplicate checkouts:** two open checkout sessions can both be paid before the first webhook lands (BIG_AUDIT A7 risks). Harmless in test mode.
- **Email confirmation / Supabase Auth URLs:** if signup confirmation emails are enabled, the Supabase project's Auth, URL Configuration, Site URL and Redirect URLs must include the Railway URL (the app has an `/auth` route). Check this if signup works locally but not on Railway.
- **Do not set `UNLIMITED_USER_EMAILS` in production.**
