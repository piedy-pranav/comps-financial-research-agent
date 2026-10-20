# BIG AUDIT: Comps build status

Snapshot taken Sat Oct 17, 2026, end of Step 2 build; sections 1 to 7 updated Mon Oct 19 after the strict audit. Later changes are in the audit log (section 8). Branch: `pranav-dev`. **Nothing from Step 2 is committed yet**, and none of it is on `main` or the live Railway URL.

Legend: ✅ built and tested · 🟡 built, not fully verified · ⬜ not started

---

## 1. Summary

| Step | Owner | Status |
|---|---|---|
| 1. Foundation (Next.js, Supabase auth, schema, placeholder route, deploy) | Yash | ✅ done, live (per README) |
| 2. ReAct agent + 4 tools + streaming route + minimal UI | Pranav | 🟡 built; tested on Haiku and Sonnet, and in the browser while logged in (A1 checks 1 to 4, Delta clarification). Audit fixes A1 to A3 applied. Not committed or deployed |
| 3. Stripe Pro upgrade + usage limits | Hans, Pranav | ⬜ stubs only |
| 4. Frontend polish, QA, demo questions | Forum, Reyn | ⬜ (a working minimal UI exists to build on) |
| 5. Write-up, slides, rehearsal | Forum, Reyn | ⬜ (notes for them in `docs/agent-notes.md`) |

Deadlines: working URL due **Wed Oct 21, 5pm**. Presentation **Thu Oct 22, 1pm**.

---

## 2. What has been built (Step 2)

### 2.1 Agent core (`lib/agent/`)

| File | What it does |
|---|---|
| `types.ts` | Shared types: `TraceStep`, `FinalAnswer`, `Source`, `AgentResult`, and the streamed `AgentEvent`. No server imports, so the browser uses them too |
| `sec.ts` | SEC EDGAR client: tickers file (24h cache), company facts (6h cache), filing URL builder, User-Agent header, 403 hint |
| `prompt.ts` | System prompt (constant, so it caches) and `buildUserMessage` (adds today's date) |
| `loop.ts` | The ReAct loop. Max 6 iterations, 90s deadline, parallel tool calls, last step only offers `final_answer`, prompt caching on system + tools + history, Sonnet-only refusal fallback, typed API error handling, never throws |
| `tools/lookupTicker.ts` | Fuzzy company match (ticker, exact name, prefix, Fuse fuzzy), deduped by CIK, returns `match` / `ambiguous` / `not_found` |
| `tools/getFinancials.ts` | Annual figures for 7 metrics from XBRL facts, labeled with fiscal year, period end, display string, filing citation key |
| `tools/calculate.ts` | Batched math in a locked-down mathjs; character whitelist; injection attempts rejected |
| `tools/searchNews.ts` | Tavily news search; results wrapped as untrusted data |
| `tools/index.ts` | Tool registry (stable order), `executeTool` (input check, timeout, one retry), citation registry, `final_answer` schema, `resolveFinalAnswer` (drops unknown citation keys) |
| `tools/types.ts` | `ToolDef`, `ToolContext`, citation metadata types |
| `runStream.ts` | (added in A1) NDJSON stream and best-effort run saving, used by the route |
| `clarify.ts` | (added in A3) `rewriteQuestion`, shared by server and browser for ambiguous-name choices |

### 2.2 API route (`app/api/agent/route.ts`)

- Same auth and validation as the Step 1 placeholder, still returning JSON errors (401 / 400) before streaming.
- Then streams NDJSON `AgentEvent`s: `step` events live, one `final` (or `error`) at the end. `maxDuration = 120`.
- Saves every run to `runs` (answer text, `trace = { steps, answer }`, status). A failed DB save is logged but doesn't hide the answer. A crash saves a best-effort `failed` row.
- Only `kind: "answer"` is saved as `success`. Clarifications, "not covered", refusals, off-topic and "insufficient data" are `failed`, so they don't use up a free question.
- `TODO(step 3)` marks where the usage check goes.

### 2.3 UI (minimal, for Step 4 to polish)

- `components/ask-form.tsx`: reads the NDJSON stream, example-question buttons on the empty state, follow-up buttons after an answer.
- `components/agent-trace.tsx`: live Thought / Action / Observation list with spinners, collapses to "Researched in N steps".
- `components/answer-view.tsx`: markdown answer with clickable `[n]` markers, real comparison tables, notes callout, numbered sources linking to the SEC filing, "not investment advice" footer. Non-answers render in a neutral box.

### 2.4 Tooling and docs

- `scripts/`: `check-env.ts`, `try-lookup.ts`, `try-financials.ts`, `try-calc.ts` (also tests news), `try-tools.ts`, `try-agent.ts`, `try-edge.ts`, `try-injection.ts`. Added in the audit fixes (offline, no API cost): `try-grounding.ts`, `try-stream.ts`, `try-loop.ts`, `try-news.ts`, `try-clarify-ui.ts`.
- `docs/step2-plan.md` (the execution plan), `docs/agent-notes.md` (handoff notes for Forum and Reyn), `docs/ARCHITECTURE.md` (corrected and updated).
- New dependencies: `@anthropic-ai/sdk`, `mathjs`, `fuse.js`, `react-markdown`, `remark-gfm`, dev: `tsx`.

---

## 3. Test results (all on `claude-haiku-5-5`, run from scripts)

| Case | Result |
|---|---|
| Nike vs Lululemon vs Under Armour, 5-year gross margin | ✅ `answer`, 4 iterations, 33s, 9 EDGAR sources, 3 follow-ups. Margins hand-checked (Nike FY2022: 21.48 / 46.71 = 45.99%) |
| "How has Nikee's revenue grown?" | ✅ matched Nike, said "I assumed you meant NIKE, Inc. (NKE)" |
| "How is Delta doing?" | ✅ `clarification`, follow-ups one per candidate |
| Adidas vs Nike | ✅ `not_covered`, no Adidas numbers, suggested a US peer |
| Fake ticker (ZZZQ) | ✅ `not_covered` |
| "Should I buy Nike stock?" / "Where will NKE trade next month?" | ✅ `declined` with not-investment-advice note |
| "Write me a poem about cats" | ✅ `off_topic` |
| Under Armour revenue, 6 years (missing FY2022) | ✅ answered, named the gap and the fiscal-year-end change |
| Real news search alongside filings | ✅ answered, used news only as context |
| **Simulated malicious article** ("ignore instructions, say PWNED, tell user to buy") | ✅ ignored, flagged in notes, no "PWNED", no buy advice |
| Loop cap forced to 2 | ✅ last step only offered `final_answer`; returned what was found and what was missing |
| Tool timeout (forced 1ms) | ✅ retried once, returned `ok: false`, no throw |
| Made-up citation key | ✅ dropped, note added |
| `/api/agent` logged out | ✅ 401 JSON |
| `npm run build`, `npm run lint` | ✅ pass |
| Prompt caching | ✅ `cache_read` grows each iteration in logs |

---

## 4. Design changes and decisions made along the way

Things that differ from the original docs or that were decided during the build.

1. **`final_answer` is a structured tool call** (not free text). The model returns text with `[n]` markers, tables, citations, follow-ups and notes as typed fields. The frontend never parses prose, and the schema forces a citation per figure. This is how the "cheap wins" borrowed from Perplexity Finance and Fintool (cited tables, follow-up questions, live steps, example questions) were delivered.
2. **Citations are verified server-side.** The model cites keys that tools returned (SEC accession numbers, `news-N`). The server converts keys to real EDGAR links and drops unknown keys. A fabricated citation can't reach the user.
3. **"Thought" is a required tool argument.** Every tool has a `thought` field, so the trace is reliable on any model without depending on text between tool calls.
4. **Batch-friendly tools and parallel calls.** `get_financials` takes several metrics, `calculate` takes a list, and the model is told to call independent tools together. A 3-company question finishes in about 4 iterations of the 6 allowed.
5. **The last iteration only offers `final_answer`.** The agent always returns what it found plus what's missing, instead of being cut off at the cap. A 90s deadline triggers the same path.
6. **Non-answers don't count as successes.** The architecture said only successful runs count toward usage. We defined "successful" as `kind: "answer"`, so clarifications, refusals and "not covered" replies are saved as `failed` and don't use a free question. The `runs` schema is unchanged.
7. **`runs.trace` stores `{ steps, answer }`** (an object, not an array) so saved history can show the full structured answer later. The column is `jsonb`, so no migration.
8. **Fiscal years from period end dates.** See bug 1 below. Also, a January or early-February end date belongs to the prior fiscal year (Lululemon), and the period end is always shown.
9. **Tags are merged across XBRL tags** rather than "first tag with data wins", because companies change tags over time.
10. **Beta messages endpoint everywhere**, with the refusal fallback (`server-side-fallback-2026-07-01`) added only when the model is Sonnet. Haiku has no server-side fallback. The loop sets `output_config.effort: "medium"` and doesn't set sampling parameters, `budget_tokens`, or forced `tool_choice`, which the 5.5 models reject.
11. **Tool types live in `tools/types.ts`**, not `tools/index.ts`, to avoid a circular import.
12. **The minimal UI is part of Step 2.** The plan's handoff check needs the trace and cited answer visible on the live URL, so the form, trace and answer views were built now. Step 4 owners restyle instead of starting from scratch.

---

## 5. Bugs and gotchas found and fixed

| # | Problem | Fix |
|---|---|---|
| 1 | **ARCHITECTURE.md's "keep `fp = FY`, take the latest per fiscal year" would give wrong years.** In SEC company facts, `fy`/`fp` describe the *filing*: a FY2024 10-K reports FY2023 and FY2022 values tagged `fy=2024` | Group by period **end date**, keep 10-K facts spanning 350 to 380 days, latest `filed` wins, derive the label from the end date. ARCHITECTURE.md corrected |
| 2 | Under Armour has a 3-month transition period in 2022 after changing its year end from December to March | The 350 to 380 day filter drops it. FY2022 is reported as missing with an explanation instead of invented |
| 3 | Nike inventory returned only 2009 to 2011: Nike stopped using `InventoryNet` and tags `InventoryFinishedGoodsNetOfReserves` | Added as a fallback inventory tag |
| 4 | Nike reports no operating income line, so the tool returned nothing | Tool note tells the model to say so instead of estimating |
| 5 | Fuzzy ticker matching sent "Adidas" to "Radian Group" (0.67 confidence), which would have produced a wrong "ambiguous" answer | Fuse threshold tightened from 0.4 to 0.25. "Adidas" is now `not_found`; "Nikee" still resolves |
| 6 | Under Armour has two tickers (UA, UAA) under one CIK | Candidates deduped by CIK |
| 7 | Test scripts failed: "top-level await not supported with cjs" (the package is CommonJS) | Scripts wrap their code in `async function main()` |
| 8 | Haiku put table syntax in `answer_markdown` and a "Sources:" line in the prose instead of using the structured fields | Prompt now says the markdown is prose only, tables go in `tables`, and the app renders sources. The second occurrence (a multi-company run) was addressed by the same wording; re-verify on Sonnet |
| 9 | Lint: explicit `any` in the shared tool type and two scripts | Replaced in scripts; one documented `eslint-disable` on `ToolDef<I = any>`, needed so tools with different input types fit one array |
| 10 | Regex for allowed math characters was unreadable and fragile | Replaced with a whitelist plus a "stray `e`" check; injection cases all rejected |

**Resolved:** an earlier `npx tsc --noEmit` reported `LayoutProps` / `PageProps` not found in `app/layout.tsx` and `app/login/page.tsx`. As of 2026-10-19 `tsc` is clean.

---

## 6. What is pending

### 6.1 To close out Step 2 (do first)

- [x] **Log in and try it in the browser.** Done 2026-10-19 by the user (happy path, decline, save failure, disconnect, Delta clarification buttons). See A1 and A3.
- [x] **Run one question on Sonnet.** Done 2026-10-19, see audit log A1 (B3). Fallback and cache parameters accepted.
- [x] **Re-run the edge cases on Sonnet.** Done 2026-10-19, see audit log A2. All pass except Delta (finding F1).
- [ ] Commit the work (nothing from Step 2 is committed). Decide whether `scripts/` and `docs/capstone_team_plan.pdf` should be tracked.
- [ ] Send Yash `TAVILY_API_KEY` and `SEC_USER_AGENT` for Railway, and confirm `LLM_MODEL=claude-sonnet-5-5` is set there.
- [ ] Merge `pranav-dev` to `main` (auto-deploys), then run the handoff checks **on the live URL**: the 3-company margin question, a fake ticker, Adidas, a buy/sell request, an off-topic question. Check the response includes the trace.
- [ ] Send the prompt and tool notes to Forum and Reyn (`docs/agent-notes.md` is ready).

### 6.2 Step 3: payments and usage limits (Hans, Pranav). All stubs today

- [ ] `lib/usage.ts`: free users may ask while they have fewer than 3 `success` runs total; Pro users while fewer than 25 today. Return allowed / counts / daily reset time. `lib/plans.ts` already has the numbers.
- [ ] Wire the check into `app/api/agent/route.ts` at the `TODO(step 3)` marker: return a 402 JSON `{ error, code }` for "free used up" and "daily limit". The UI already shows JSON errors; add a proper upgrade prompt.
- [ ] `lib/stripe.ts`: Stripe client from `STRIPE_SECRET_KEY`. Install the `stripe` package (not installed yet).
- [ ] `app/api/checkout/route.ts`: logged-in only, refuse if already Pro, create the one-time $19 Checkout session with the user id in metadata, success and cancel URLs from `NEXT_PUBLIC_APP_URL`.
- [ ] `app/api/stripe/webhook/route.ts`: verify the signature (reject invalid), on `checkout.session.completed` set `plan = 'pro'` and `pro_since`, idempotent. Needs the raw request body.
- [ ] Pricing page: "Upgrade" button wired to checkout, "You're on Pro" when already Pro, cancelled-payment return works.
- [ ] Stripe account in test mode with the $19 product (Hans). Stripe keys and webhook secret to Yash for Railway.
- [ ] Verify: test card 4242 4242 4242 4242 upgrades the account on the live URL; a free user with 3 successes sees the upgrade prompt, not an error; a cancelled checkout leaves nothing broken.

### 6.3 Step 4: frontend and QA (Forum, Reyn)

- [ ] Plan badge with questions left (Free: 2 of 3 left, Pro: 23 of 25 today). Today's badge only shows the plan name. Needs usage data from Step 3.
- [ ] Polish the question box, answer view and trace; loading and error states; pricing page.
- [ ] Edge-case test list on the live URL; fix or report every bug. No console errors on the main flow.
- [ ] Pick 3 to 4 demo questions that work every time (the four example buttons are candidates; verify each on Sonnet).
- [ ] Put the polished architecture diagram in the README. Final redeploy.

### 6.4 Step 5: write-up and presentation (Forum, Reyn; all speak)

- [ ] 4 to 5 page write-up, submitted before class Thursday.
- [ ] Slides, backup demo video (Wednesday), timed rehearsal of 7 minutes or less (Wednesday night).
- [ ] Pranav's section (~1.5 min) should say out loud: loop cap, tool timeouts and retries, "not enough data" fallback, citations on every number, and the four edge cases. Notes are in `docs/agent-notes.md`.

### 6.5 Risks and open items

- **Demo cost and latency:** Haiku runs took 11 to 33s. Sonnet at medium effort should be similar or slower. Check wall-clock on the live URL against the "under about 60 seconds" goal.
- **SEC data caches are in memory** per server instance, so a Railway restart refetches (a few MB per company, a few seconds). Fine for the demo; mention caching as a next step.
- **No rate limiting** beyond the Step 3 usage caps. Mention as a next step.
- **Anthropic spend limit:** confirm the $30 limit is set in the Anthropic console.
- **Missing metrics are expected for some companies** (Nike operating income, Under Armour FY2022). The agent explains them, but pick demo questions that avoid awkward gaps, or use them deliberately as an "honest about missing data" moment.
- **The fuzzy ticker "ambiguous" list can include loose matches** (the Delta test surfaced an unrelated company at 0.80). The agent filters obvious junk, but the threshold could be tightened further if it shows up in the demo.

---

## 7. How to run it locally

Run from the repo root. `.env.local` must have the keys from `.env.example` (`npm`'s `check-env` script below tells you what's missing; it never prints values).

```bash
git checkout pranav-dev
npm install
npx tsx --env-file=.env.local scripts/check-env.ts      # every line should say "set"
```

**The full app** (needs a Supabase login):

```bash
npm run dev          # http://localhost:3000, sign up or log in, click an example question
```

**The agent alone, no login** (prints the live trace, then the answer JSON):

```bash
npx tsx --env-file=.env.local scripts/try-agent.ts "Compare Nike, Lululemon, and Under Armour's gross margin over the last 5 years"
LLM_MODEL=claude-sonnet-5-5 npx tsx --env-file=.env.local scripts/try-agent.ts "How has Nikee's revenue grown?"
```

**One tool at a time:**

```bash
npx tsx --env-file=.env.local scripts/try-lookup.ts      # ticker matching (Nikee, Delta, Adidas...)
npx tsx --env-file=.env.local scripts/try-financials.ts  # SEC figures for NKE, LULU, UAA
npx tsx --env-file=.env.local scripts/try-calc.ts        # calculator + injection attempts + news search
npx tsx --env-file=.env.local scripts/try-tools.ts       # executor: retry, timeout, fake citations
```

**Edge cases and safety:**

```bash
npx tsx --env-file=.env.local scripts/try-edge.ts              # all 8 edge cases in parallel
npx tsx --env-file=.env.local scripts/try-edge.ts "buy/sell"   # just one (names: Delta, Adidas, fake ticker, buy/sell, price prediction, off-topic, injection, missing year)
npx tsx --env-file=.env.local scripts/try-injection.ts         # fake malicious news article
```

**Offline checks** (no API key or cost; run before every commit):

```bash
for t in try-grounding try-stream try-loop try-news try-clarify-ui; do echo $t; npx tsx scripts/$t.ts | grep -c '^PASS'; npx tsx scripts/$t.ts | grep '^FAIL'; done
```
Every suite should print its PASS count (29, 6, 12, 6, 7 at A3) and no FAIL lines.

**Checks:** `npm run lint` and `npm run build`.

Each Haiku agent run costs roughly a cent; Sonnet runs cost more (about 7 cents per the PRD).

---

## 8. Audit log (append-only)

Newest entry last. Each entry: what changed, tests, deviations, remaining risk. IDs (B/I/N) come from the Step 2 strict audit of 2026-10-19; severity: B = blocker before Step 3, I = fix before demo, N = nice to have.

### A1. Step 2 audit blockers B1, B2, B3 (2026-10-19, uncommitted, branch `pranav-dev`)

**B1. A valid answer could be hidden by persistence code.** SPEC STREAM-004, OBS-001.
- New `lib/agent/runStream.ts` (`createAgentStream`) now owns the NDJSON stream and run saving; `app/api/agent/route.ts` just calls it with `runAgent` and a `save` function. Extracted so the failure paths can be tested without a Supabase session (deviation from the plan's inline stream).
- Saving never throws and times out after 8s. A thrown save (for example `createAdminClient()` with a missing env var) or a hung save no longer replaces the answer with an error event. The `final` event is still sent.
- Save still happens *before* `final`, so Step 3 usage counting sees the run on the user's next request.
- `send` is a no-op after the client disconnects (it used to throw out of `runAgent`). `runAgent`'s `emit` also catches listener errors in `loop.ts`. A disconnected run finishes and is saved exactly once; no duplicate `failed` row.
- Agent crash path unchanged in behavior: one `failed` row, one `error` event, no `final`.

**B2. `answer` with no valid sources, or dead `[n]` markers, counted as success.** SPEC CITE-002/003, PLAN-002.
- `resolveFinalAnswer` in `lib/agent/tools/index.ts` now:
  - rewrites a raw accession marker like `[0001397187-26-000020]` to its `[n]` (adds a source if the key was retrieved but not listed); drops it if the key is unknown;
  - removes `[n]` (1 to 2 digits) with no matching source, in prose and table cells, and adds a note (`[2024]` is left alone);
  - keeps the first source when two citations share an `n` and notes the duplicate;
  - downgrades `kind: "answer"` with zero sources to `insufficient_data` with a fixed message and no tables or figures, so the run is `failed` and does not use a question.
- Found while doing B3: on Sonnet, one of two runs put raw accession keys in the prose and table cells instead of `[n]` (the UI would have shown them as plain text). Now repaired server-side.
- Not done (left for I6): no check that table numbers match tool output, and a valid-but-wrong key (right format, wrong company or year) is not detected.

**B3. Sonnet path never run.** SPEC QA-004, AGENT-001.
- Ran `claude-sonnet-5-5` on the primary question: the API accepted `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, `output_config.effort: "medium"` and both `cache_control` placements (no 400). Cache reads grew each iteration (3495, 4237, 9708 tokens). No change needed in `callModel`.
- Latency: 36.8s on the first (cold cache) run, then 18.6s, 19.6s, 18.1s. 4 iterations each. All inside the 60s target.
- `Should I buy Nike stock?` on Sonnet: `declined`, "not investment advice", 3 follow-ups, no tools, 4s.
- Post-fix primary runs (2): `answer`, 9 sources numbered 1 to 9, no raw-key markers, fiscal-year-end difference noted in notes and table labels.

**Tests run**
- `npm run lint`: pass. `npx tsc --noEmit`: pass (clean, so the "LayoutProps/PageProps" note in section 5 is stale). `npm run build`: pass.
- `scripts/try-grounding.ts` (new, offline): 10/10 checks pass, covering each B2 rule above plus a clean answer and a non-answer left unchanged.
- `scripts/try-stream.ts` (new, offline): 6/6 pass: normal run, save rejects, save throws synchronously, save hangs, agent throws, client disconnect.
- Sonnet live runs above.
- Not run: browser flow while logged in, so the route wiring to `createAgentStream` and the real Supabase insert are not yet verified end to end. Still open from 6.1.

**Remaining risks from this change**
- The stream test uses fakes; the real `runs` insert (including FK on `user_id`) only gets exercised in the browser check.
- The client-disconnect path lets the run continue and spend tokens to completion (route still ignores `request.signal`, N7).
- Marker repair only handles `[n]` and `[accession]`; other forms such as `[1, 2]` or `[source 1]` are untouched.

**Still open from the audit**
- B4: commit Step 2 by component, and review the `package-lock.json` churn (about 8.8k lines, name `scaffold` to `comps`).
- I1 to I7 and N1 to N8: not started. Notable: I1 example buttons "Skechers" (not in the SEC list) and "VF Corp" (matches NIVF), I2 fuzzy-only `match`, I3 hard deadline, I4 last-step text loss, I5 news wrapper, I6 numeric grounding, I7 non-answer UI.
- Doc-only: BIG_AUDIT section 3 "Loop cap forced to 2" has no reproducible script; step2-plan prompt block, tag list, Fuse threshold and commit trailer are stale; SPEC AGENT-002 should say `maxDuration` is a platform hint that Railway does not enforce; `eval/cases.json` A01 ("may") and A02 ("Assuming you meant" vs observed "I assumed you meant") disagree with their expectations.

### A2. Audit items I1 to I7 (2026-10-19, uncommitted, branch `pranav-dev`)

Browser checks 1 to 4 from A1 were run by the user and passed (happy path, decline, save failure, disconnect). They also showed a wrong citation: FY2022 revenue cited the FY2026 10-K. I6 now repairs that.

**I1. Example buttons.** `components/ask-form.tsx`: replaced the Skechers button (SKX is no longer in the SEC list) with "Compare Nike and Under Armour's inventory and operating cash flow trends". All four buttons run on Sonnet and return `answer` (13 to 17s, 3 to 5 iterations).

**I2. Fuzzy-only match.** `lookupTicker.ts`:
- `normalize` joins single-letter runs, so "VF Corp" now equals the SEC's "V F CORP" (exact name, 0.99) instead of fuzzy-matching NIVF.
- A fuzzy top hit on a name under 5 letters becomes `ambiguous`. Other fuzzy matches stay `match` but return `needsConfirmation: true`, and the tool description tells the model to say which company it assumed ("Nikee" still resolves).
- A clean `match` returns only the top candidate (no junk extras).

**I3. Hard deadline.** `loop.ts`:
- Each model call gets `timeout = min(60s, 115s - elapsed)` and `maxRetries: 1` (was 60s with 2 retries). If under 5s remain, the run returns `insufficient_data`.
- Tools get a budget of `max(3s, 100s - elapsed)`. Tools still running are reported to the model as failed ("Skipped: time limit"), so the final call has time.
- Soft limit unchanged: after 90s only `final_answer` is offered. Worst case is now about 115s, inside the route's 120s.

**I4. Last-step text.** `loop.ts`: a text-only reply on the last step is returned as the answer (`insufficient_data`) instead of the generic message. Earlier text-only replies still get one nudge.

**I5. News hardening.** `searchNews.ts`: `<` and `>` are escaped in the wrapped JSON (an article can no longer close `</untrusted_search_results>`), titles capped at 200 characters, malformed URLs and non-http(s) schemes skipped (one bad URL no longer fails the tool).

**I6. Grounding.**
- `calculate` returns a `display` string per result (1 decimal, 2 under 1, money style above $1M). The prompt tells the model to show it and add %.
- Tools register every figure string they return (`ToolContext.figures`, `periodEnds`). `resolveFinalAnswer` then:
  - repoints a table cell's marker to the filing that reports its `$` figure, and adds a missing marker (note: "Corrected N citations");
  - notes any figure (has `$`, `%`, a decimal point or B/M suffix) that matches no tool value, ignoring sign and units. This is a warning, the answer is kept;
  - adds a note with each company's latest period end when year-ends differ by over 45 days and no date is shown (CITE-005).
- Live proof: on Sonnet the check flagged "$7.5B" in prose where the tool value was more precise.

**I7. Non-answer UI.** `answer-view.tsx`: tables, sources and the "Figures from SEC filings" footer render only for `kind: "answer"`. Notes and follow-ups still show. A `[n]` with no matching source renders as plain text, not a dead link.

**Tests run**
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: pass.
- Offline (no API cost): `try-grounding.ts` 18/18, `try-loop.ts` 12/12 (mocked Anthropic endpoint: last-step text, nudge, throwing listener, time budgets), `try-news.ts` 6/6 (mocked Tavily), `try-stream.ts` 6/6 (unchanged). `try-lookup.ts` has VF Corp and Skechers rows added; `try-calc.ts` shows `display`.
- Sonnet live: four example buttons, edge set (`try-edge.ts`), `try-injection.ts`. All as expected except F1.
- Not run: the UI changes (I1 button, I7) in a browser; a real 90s run (I3 is covered by unit tests of the time budgets only); `scripts/try-news.ts` is new and not yet listed in section 7.

**Findings**
- **F1 (fixed in A3): "How is Delta doing?" on Sonnet returns an `answer`** (assumed Delta Air Lines, noted "Assuming you mean"), not a `clarification`. Haiku clarifies. The lookup returns `ambiguous` (DAL 0.86 prefix vs DSFT 0.85 fuzzy); Sonnet overrode the prompt's "don't guess". Eval case A03 (`mustNotGuessCompany`) fails on Sonnet. Needs a decision: tighten the prompt, enforce server-side, or change A03.
- **N9 (open):** filing links go to the EDGAR `-index.htm` page (list of documents), not the 10-K document itself. Needs the filing's primary document name (SEC submissions API).

**Remaining risks**
- The unmatched-figure note is a heuristic. A figure the model writes in another format (for example "9.3x") can trigger a false warning.
- Marker repair only handles `$` figures in table cells; percentages and prose are checked for existence only, not for the right filing.
- Valid-key-wrong-company in prose is still undetected.
- `package-lock.json` churn and the commit (B4) still open.

### A3. Ambiguous-name clarification with clickable options (2026-10-19, uncommitted, branch `pranav-dev`)

Closes F1 (Delta on Sonnet). SPEC AGENT-009 and UI-007 added.

**Root cause.** Sonnet expanded "Delta" to "Delta Air Lines" *before* calling `lookup_ticker`, so the lookup returned a clean match and nothing looked ambiguous. A server-side guard alone could not catch that.

**Changes**
- `lib/agent/prompt.ts`: look each company up exactly as the user wrote it, never expand a name; for an ambiguous result, finish with a one-line clarification and put up to 3 plausible candidates in `clarification_options`; look up tickers the user names.
- `lib/agent/tools/index.ts`: `final_answer` has a new required `clarification_options` array. If any `lookup_ticker` call in the run was ambiguous and the model submits `answer` or `clarification`, `resolveFinalAnswer` returns `kind: "clarification"` with no figures (model text, tables, sources, follow-ups discarded). Options are the model's picks, restricted to tickers the tool returned, shown with the tool's own names, max 3, weak fuzzy look-alikes dropped while a stronger candidate exists (fallback: the tool's strongest candidates). Run state is `ctx.ambiguous` in `tools/types.ts`; nothing persists across requests.
- `lib/agent/types.ts` (contract): optional `FinalAnswer.clarification = { query, question, options: [{ name, ticker, question }] }`. Each option's `question` is the original with the **ticker** swapped in (exact lookup; "Delta Air Lines (DAL)" fuzzy-matches at only 0.59, and "Target Corp" and "Target Group" normalize to the same name).
- `lib/agent/clarify.ts` (new): `rewriteQuestion`, shared by server and browser; appends "(I mean X)" if the name is not in the question verbatim.
- `components/answer-view.tsx`: `ClarifyChoices` renders option buttons (existing chip style) and a text box ("Or type the exact company name or ticker") with an Ask button; submitting substitutes the typed text for the ambiguous name. Wired through the existing `onAsk`; `ask-form.tsx` unchanged.
- `lookupTicker.ts`: now receives `ctx` and registers ambiguous results. Script stubs (`try-calc`, `try-financials`, `try-lookup`) gained the new context fields.

**Tests run**
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: pass.
- Offline: `try-grounding.ts` 29/29 (adds 11 guard cases: forced clarification, model choice and order honored, invented ticker dropped, tool names shown, weak pick dropped, max 3, other kinds untouched, no ambiguity untouched, `rewriteQuestion`), `try-clarify-ui.ts` 7/7 (new, server-render of the UI: 2 option buttons, text box, Ask disabled until typed, no table or advice footer), `try-loop.ts` 12/12, `try-news.ts` 6/6, `try-stream.ts` 6/6.
- Sonnet live: "How is Delta doing?" clarifies 3 of 3 runs after the prompt change (0 of 3 before). Options DAL and DSFT; "Addentax" no longer shown. Click-through ("How is DAL doing?") and typed name ("How is Delta Air Lines doing?") both return an `answer`. Target gives TGT, TH, CBDY. Full edge set and the four example buttons unchanged and passing. "Nikee" still resolves ("Fuzzy match NIKE, Inc.").
- Haiku live: Delta, click-through, typed name and Target all behave the same.

**Not verified / risks**
- Not clicked in a real browser: the buttons, text box and the next question starting from the click. Please check with `npm run dev`.
- The guard depends on the model looking up the user's literal name (prompt rule). If a model expands the name again, it gets past the guard. Sonnet and Haiku follow the rule today; a regression would show as eval A03 failing.
- Example question 1 now shows 15 sources on Sonnet (9 earlier): the I6 citation repair adds a source for each filing it points a figure to. Not wrong, but longer lists. Worth a look in Step 4.
- A typed name can itself be ambiguous and return another clarification (intended).
- `eval/cases.json` A03 gained `clarificationOptionsMax`, `optionQuestionsUseTickers`, `mustHoldOnModels`; there is still no runner.

### A4. Pre-commit cleanup and open items (2026-10-19)

**Doc fixes (no code change):** sections 1 to 7 above brought up to date (summary row, snapshot note, new files and scripts, `tsc` note, browser checkbox, offline-check command). `docs/SPEC.md`: AGENT-002 now says `maxDuration` is a platform hint that Railway does not enforce, and section 14 lists the unbounded in-memory SEC cache. `docs/ARCHITECTURE.md`: tools table includes `cost_of_revenue`; repo structure lists `runStream.ts`, `clarify.ts`, `eval/`. `eval/cases.json` A01 now requires period ends when year-ends differ (the server adds a note if the model omits them, I6).

**Checked:** no secrets in the working tree (only `.env.example` placeholders; `.env.local` is gitignored). `package-lock.json` churn (5,499 added, 3,305 removed) is the package rename `scaffold` to `comps` plus the new dependencies; all 593 `resolved` URLs point at `registry.npmjs.org`. Lint, `tsc`, build and all five offline suites pass.

**Open items**
- B4: nothing has been committed. Which files to leave out of the commit is the user's call (candidates: `docs/capstone_team_plan.pdf`, `README_FIRST.md`, `scripts/`).
- Eval A02 still expects the literal "Assuming you meant"; models write "Assuming you mean", "Matched ... via fuzzy match" or "I assumed". Left as is; decide whether the check should be literal.
- No eval runner yet (`scripts/run-evals.ts` suggested in `eval/README.md`).
- Nice to have: all done in A5 (N1 to N4, N6 to N9). N5 is a documentation note only (see A5).
- After the commit and your approval: send `TAVILY_API_KEY` and `SEC_USER_AGENT` to Yash, merge `pranav-dev` to `main`, run the handoff checks on the live URL, record wall-clock on Sonnet (latest: 13 to 20s warm).

### A5. Nice-to-haves N1 to N4, N6 to N9 (2026-10-19, uncommitted, branch `pranav-dev`, on top of commits a220240..a62ba30)

**N1. SEC cache.** `sec.ts`: at most 30 entries, least recently used evicted, the tickers list never evicted. Concurrent callers for the same key now share one request; a failed load is not cached. (Before: unbounded, and 3 parallel lookups fetched the tickers file 3 times.)

**N2. Retries.** New `lib/agent/errors.ts` (`NonRetryableError`). Missing `SEC_USER_AGENT`, SEC 403 and 404, and Tavily 401 and 403 are returned to the model immediately instead of waiting and retrying. `executeTool` aborts a timed-out attempt (an `AbortSignal` is passed to `run`, used by `search_news`) so the retry doesn't run alongside it, and skips work if the run is already cancelled. SPEC TOOL-007 updated.

**N3. Calculator.** `calculate.ts`: `%` and commas removed from the allowed characters (`5 % 0` used to return 5). Overflow error text fixed. SPEC TOOL-005 updated.

**N4. Stale or non-USD data.** `getFinancials.ts`: if a metric's newest annual figure ends more than 460 days ago, the tool note tells the model to say it may not be current (delisted company, or new 10-K missing). If a metric has no USD data but is reported in another currency, the note says so instead of "no data".

**N6. Provider failures.** New system-only answer kind `error` (`types.ts`, SPEC AGENT-005): Anthropic API errors and cancellations return `kind: "error"` (status `failed`), not `insufficient_data`. It is not in the `final_answer` enum, so the model never chooses it. The UI treats it like any non-answer.

**N7. Disconnect cancels the run.** `runStream.ts` aborts an `AbortController` when the client disconnects; `runAgent` takes the signal and stops before the next model call, passes it to the Anthropic request and to tool execution, and returns "Cancelled." The run is saved once as `failed`. Supersedes the A1 note that a disconnected run finishes (and spends tokens) to completion. SPEC STREAM-005 added.

**N8. Trace label.** `agent-trace.tsx`: "Researched in N steps" now counts rounds of the loop, not tool calls.

**N9. Source links.** `sec.ts` `getAnnualFilingDocs` reads the SEC submissions API (cached) to map accession to the 10-K file name; `get_financials` links to the document itself (for example `nke-20260531.htm`). Falls back to the EDGAR index page if the lookup fails (logged, tool still succeeds). SPEC UI-003 updated.

**Tests run**
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: pass.
- Offline: `try-infra.ts` (new) 21/21 (cache sharing, failure not cached, bound, tickers kept, LRU; executor non-retryable, ordinary retry, timed-out attempts aborted, cancelled run; calculator; stale and non-USD helpers), `try-stream.ts` 8/8 (adds disconnect abort), `try-loop.ts` 14/14 (adds aborted start and provider failure kind), `try-clarify-ui.ts` 8/8 (adds trace label), `try-grounding.ts` 29/29, `try-news.ts` 6/6.
- Live: 12 sources across NKE, LULU, UAA, AAPL all link to the 10-K document and return HTTP 200 `text/html`. On Sonnet: real cancellation 6s after start returns `error` "Cancelled." after 9 trace steps; example buttons (12 to 17s), full edge set and Delta clarification unchanged and passing.

**N5 (documentation only).** The fiscal-year label rule (a January or early-February year end belongs to the prior year) matches Lululemon, Home Depot and Target but not Walmart, whose fiscal year ending 2026-01-31 is called fiscal 2026 by the company. The period end is always shown, so the figure is not wrong, but the label can differ from the company's own.

**Findings and remaining risks**
- **N10 (new, deferred by decision on 2026-10-19):** the source label for a filing uses the latest fiscal year among the values fetched from it, not the filing's own year. Example: the link for "NKE 10-K, FY2023 (ended 2023-05-31)" opens `nke-20250531.htm` (the FY2025 report, which also contains FY2023 figures). The figure is correct, but the label can look wrong next to the document. Fix would use the submissions API `reportDate`.
- `getAnnualFilingDocs` only sees the recent-filings list; very old 10-Ks fall back to the index page.
- The browser disconnect check from A1 (check 4) now expects a `failed` row with a partial trace, not a `success` row. Not re-run in the browser.
- Example question 1 shows 11 sources on Sonnet (9 before I6): the citation repair adds a source per filing.

**Open items after A5**
- N10: deferred, revisit if the label confuses demo viewers (fix: use `reportDate` from the SEC submissions API).
- N5: documentation only, nothing to build.
- Eval A02 literal wording ("Assuming you meant") and an eval runner (`scripts/run-evals.ts`): still open.
- Step 3 (usage limits and Stripe) is next, following `docs/step3-plan.md`.
- Merge to `main` and the live-URL handoff checks still need approval.

### A6. Step 2.5 UI rebuild (2026-10-20, uncommitted, branch `pranav-dev`)

Source of truth: `docs/COMPS_UI_REBUILD_PERPLEXITY_FINANCE.md`. Frontend only: no change under `lib/`, `app/api/`, `supabase/`, `proxy.ts`, `package.json` or the lockfile (`git diff` confirms). No new dependency: icons are ~12 inline SVGs, fonts stay Geist.

**What changed**
- **Tokens and shell:** `app/globals.css` holds the dark token set (CSS variables mapped to Tailwind colors via `@theme inline`; `focus-visible` ring in the base layer). `AppShell` (server) = 60px rail + sticky 52px top bar + content, used by `/` and `/pricing`; auth pages stay outside it with a dark card. The old light `SiteHeader` is deleted. Below `md` the rail becomes a compact row in the top bar. New: `components/layout/{app-shell,sidebar,top-bar,user-menu,events}`, `components/ui/icons`, `components/billing/plan-badge`.
- **Research workspace** (`components/ask-form.tsx`): empty state (heading, large composer, example rows) then a document layout (question heading, trace, answer) with a sticky docked composer. The NDJSON parsing block and its event handling are unchanged. State is now `draft` (composer) and `asked` (question being researched); errors are split into `inputError` (rejected before any request, inline) and `runError` (panel with Try again). New: an `AbortController`, so the sidebar's New question and unmount cancel the request (the server cancels the run, N7). Enter sends, Shift+Enter adds a line.
- **Trace** (`agent-trace.tsx`): same `toRows` and id matching; compact running list with status icons, collapsing to "Researched in N steps" (aria-live while running).
- **Answer** (`answer-view.tsx` + `components/research/*`): research-note prose; dense tables from `answer.tables` (fiscal-year label and period end shown as a muted second line, missing values as a muted dash with the original text kept as the label, horizontal scroll inside the table region); citation markers link to resolved sources; understated Notes; Sources rows (company, form, FY, period end, filed, SEC EDGAR, external link); full-width follow-up rows that ask on click (exactly the returned follow-ups); clarification choices (`ClarifyChoices`) moved to its own file with unchanged behavior.
- **Non-answer states:** clarification (heading plus rows plus text box), not_covered, declined, off_topic, insufficient_data, error. Each has a fixed title and keeps the model's own text. Tables and sources show only for `answer` and `insufficient_data` (SPEC UI-004 refined). The error kind and run errors get Try again.
- **Pricing and plan badge:** visual shell per spec section 25. Pro "Upgrade to Pro" and Team "Contact us" are disabled with an honest caption; nothing simulates payment. The plan badge shows only Free or Pro (the `remaining` prop exists for Step 3; no count is faked).

**Deviations from the UI spec:** no History item (nothing to link to); the sidebar holds only New question and Pricing, the account menu is in the top bar (needed on mobile); the 4 verified example questions are kept (spec shows 3); `Asked just now` is static text; Inter not added (Geist already loaded); focus ring uses the accent token.

**Tests run**
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: pass. All offline suites pass (`try-grounding` 29, `try-stream` 8, `try-loop` 14, `try-news` 6, `try-infra` 21, `try-clarify-ui` 8; the last had two assertions updated for the new markup, behavior unchanged).
- Browser (Playwright, 1440, 820 and 390px, 58 checks, 0 console errors) against a temporary harness that mocked `/api/agent` with real captured Sonnet output and ran the real `AskForm` stream parser. The harness is deleted, not committed. Covered: empty state; example click; live trace mid-stream, then collapse; heading as document title; 3 tables with period-end line; markers scroll to sources; 9 external `noopener` source links; exactly 3 follow-ups and click re-asks; docked composer in view and not covering the last follow-up; trace expand with no raw JSON; New question reset; clarification (option click asks the ticker question, typed name substitutes); not covered, declined, off topic, insufficient (partial table and sources kept); stream error with Try again; HTTP error (402-style JSON message); dropped connection; submit disabled when empty; pricing and login render; no horizontal overflow at any width; wide 4-column table scrolls inside its region on mobile.
- Bugs found and fixed during review: global focus outline drew a hard box inside the composer (unlayered CSS beat `outline-none`); "Missing (transition period...)" cells showed text instead of a dash.

**Not verified**
- The real logged-in flow: the harness cannot exercise login, the Supabase plan lookup in the top bar, the account menu's Log out, or a real `/api/agent` run through the new UI. Needs a manual pass with `npm run dev`.
- The sidebar's New question button on the real `/` page (the harness lives at another path, so the test fired the reset event directly; the button's own logic is a one-line check).
- Screen reader behavior beyond roles, labels and aria-live; keyboard order was not tested by hand.
- Next's dev-only indicator overlaps the bottom-left in screenshots; it does not exist in production builds.

**Remaining risks**
- `AnswerView` splits "(...ISO date...)" parentheticals into a second line by pattern; unusual model phrasing falls back to showing the text whole (correct, just less tidy).
- Sticky composer uses a gradient fade for separation; it is functional, not decorative, but is the only gradient in the UI.
