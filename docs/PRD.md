# PRD: Comps

*"Comps" is the finance term for comparing a company against its peers, which is exactly what the product does.*

*Group 3: Yash Khadilkar, Pranav Piedy, Forum Sanjanwala, Reyn Okinaga, Hans Grunwald*

## Problem

Comparing how a company is doing against its competitors over several years is slow. An analyst who wants to know how Nike's gross margin and revenue growth stack up against Lululemon and Under Armour over the last five years has to open three or more annual reports (each 100+ pages), find the right line items, line up fiscal years that end in different months, copy everything into Excel, and do the math. That's an hour or more for a single question.

Generic chatbots are faster but can't be trusted here. They often make up or misremember financial figures and don't say where a number came from. The tools that do this well (Fintool, AlphaSense, Bloomberg) are priced for large firms, often thousands of dollars a year per seat.

## Target users

1. **Medium to long-term investors.** People who make decisions based on fundamentals and multi-year trends (margins, growth, cash flow), not day or swing traders who care about intraday price moves.
2. **In-house corporate analysts.** FP&A, strategy, and competitive intelligence teams who benchmark their own company against peers. Example: an analyst at Nike preparing a quarterly competitor review for leadership.

## Why AI, and why a ReAct agent

A peer benchmark isn't a single lookup. The system has to identify each company, pull several metrics across several years, calculate ratios and growth rates, and sometimes check recent news to explain a change. The number and order of steps depends on the question.

A single retrieval pass (plain RAG) can't plan that. A ReAct agent reasons about what it still needs, calls a tool, reads the result, and repeats until it has enough evidence. Pulling the numbers from SEC filings instead of the model's memory, and doing all math in a calculator tool, is what makes the answers trustworthy.

## Why this data fits these users

SEC filings are quarterly and annual, which matches the time horizon our users care about. We intentionally skip real-time prices and trading signals, since that's a different user with different needs.

## What we're copying

Fintool is the closest existing product (an AI copilot over SEC filings). AlphaSense, Hebbia, and Perplexity Finance cover parts of the same space. Our version is aimed at individual investors and in-house analysts, at a much lower price.

## Business model

| Plan | Price | What you get |
|---|---|---|
| Free | $0 | 3 questions to try it |
| Pro | $19 one-time (Stripe test mode) | Up to 25 questions a day |
| Team | Custom pricing, "Contact us" | Higher limits, multiple seats, shared workspace for an analyst team |

A question costs us roughly 7 cents in LLM calls (Claude Sonnet 5.5), so a one-time $19 covers a couple hundred questions. The daily cap keeps one heavy user from running up costs. We don't offer an "unlimited" plan, since every question has a real cost. The Team plan is aimed at corporate analyst groups like a Nike strategy team. It shows on the pricing page with a "Contact us" button, but we aren't building team accounts for this version. In a real launch we'd move Pro to a monthly subscription and add team plans for corporate analyst groups.

## Core user journey

1. User signs up and gets 3 free questions.
2. User asks a question, e.g. "Compare Nike, Lululemon, and Under Armour's gross margin and revenue growth over the last 5 years."
3. The app streams the agent's reasoning trace (Thought, Action, Observation) while it works.
4. The user gets a short written answer with the numbers side by side, each fiscal year labeled, and every figure cited to its SEC filing.
5. After the 3rd free question, the user sees an upgrade prompt, pays once through Stripe Checkout, becomes Pro, and keeps going.

## Scope

**In scope**
- Sign up, log in, log out (Supabase Auth)
- ReAct agent with 4 tools: ticker lookup, get financials (both SEC EDGAR), calculator, news search (Tavily)
- Multi-year trends for one company and benchmarking across 2 to 3 companies
- Cited answers and a visible reasoning trace
- Free tier (3 questions) and a one-time Pro upgrade via Stripe Checkout in test mode
- Deployed on a public URL (Railway)

**Out of scope (next steps)**
- Real-time stock prices, trading signals, buy/sell recommendations
- Companies that don't file with the SEC (e.g. Adidas)
- Monthly subscriptions, team accounts, charts, saved question history

## Edge cases we handle

| Case | Behavior |
|---|---|
| Typo in a company name ("Nikee") | Matches the closest company and says "Assuming you meant Nike (NKE)" |
| Ambiguous name ("Delta") | Lists the top matches and asks which one the user meant |
| Ticker or company doesn't exist | Says it couldn't find the company and suggests checking the name |
| Company doesn't file with the SEC (Adidas) | Clear "not covered" message, no made-up numbers |
| Companies have different fiscal year ends | Each figure is labeled with its fiscal year and end date so comparisons aren't misleading |
| Metric missing for some years | Answers with what exists and says which years are missing |
| Buy/sell or price prediction request | Declines and explains we cover fundamentals, with a "not investment advice" note |
| Off-topic question | Politely redirects to what the product does |
| Instructions hidden in a news article | Tool results are treated as data, never as instructions to the agent |
| Tool timeout or API error | Retries once, then tells the model the tool failed so it can adjust |
| Agent can't finish | Stops at the loop cap and returns what it found plus what's missing |
| Free questions used up | Upgrade prompt, not an error |
| Pro user hits the daily cap | Friendly "you've hit today's limit" message with the reset time |
| Payment cancelled | Returns to the app, still on the free plan, nothing broken |
| Already Pro and visits pricing | Shows "You're on Pro" instead of a buy button |

## Success criteria for the demo

- A new user can sign up, ask a three-company benchmark question, and get a correct, cited answer in under about 60 seconds.
- Every edge case in the table above returns a clean message.
- A test card payment upgrades the account to Pro, and the user can ask another question right away.
- No secrets in the repo, and the live URL is stable.

## Model choice

The agent runs on Claude Sonnet 5.5 (`claude-sonnet-5-5`) through the Anthropic API. The model name is an environment variable, so we can develop on the cheaper Claude Haiku 5.5 and switch to Sonnet for the demo without a code change.
