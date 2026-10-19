// SEC EDGAR client: tickers file, company facts, filing URLs, with in-memory caching.
// SEC requires a User-Agent with a name and email on every request (about 10 req/s max).

export type SecCompany = { cik: number; ticker: string; name: string };

const cache = new Map<string, { at: number; value: unknown }>();

async function getCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function secFetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) throw new Error("SEC_USER_AGENT is not set.");

  const res = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 403) {
    throw new Error("SEC EDGAR returned 403. Check that SEC_USER_AGENT has a name and email.");
  }
  if (!res.ok) throw new Error(`SEC EDGAR returned ${res.status} for ${url}`);
  return (await res.json()) as T;
}

type TickersFile = Record<string, { cik_str: number; ticker: string; title: string }>;

export function getTickers(): Promise<SecCompany[]> {
  return getCached("tickers", 24 * 60 * 60 * 1000, async () => {
    const raw = await secFetchJson<TickersFile>(
      "https://www.sec.gov/files/company_tickers.json",
      15_000,
    );
    return Object.values(raw).map((r) => ({ cik: r.cik_str, ticker: r.ticker, name: r.title }));
  });
}

export async function findByTicker(ticker: string): Promise<SecCompany | null> {
  const t = ticker.trim().toLowerCase();
  const all = await getTickers();
  return all.find((c) => c.ticker.toLowerCase() === t) ?? null;
}

export type XbrlFact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
};

export type CompanyFacts = {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, XbrlFact[]> }>>;
};

export function getCompanyFacts(cik: number): Promise<CompanyFacts> {
  return getCached(`facts:${cik}`, 6 * 60 * 60 * 1000, () =>
    secFetchJson<CompanyFacts>(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`,
      15_000,
    ),
  );
}

export function filingUrl(cik: number, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${accession}-index.htm`;
}
