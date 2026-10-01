// Minimal Riot API client for the data pipeline. Each routing host (na1, americas, ...) has its own
// rate limit, so each gets its own limiter. Limits match a Personal/Development key:
// 20 requests per second and 100 per 2 minutes. A 429 waits for Retry-After and tries again.

const LIMITS = [
  { count: 20, ms: 1_000 },
  { count: 100, ms: 120_000 },
];

class Limiter {
  #sent = [];

  async take() {
    for (;;) {
      const now = Date.now();
      this.#sent = this.#sent.filter((t) => now - t < LIMITS[LIMITS.length - 1].ms);
      const waits = LIMITS.map(({ count, ms }) => {
        const inWindow = this.#sent.filter((t) => now - t < ms);
        return inWindow.length < count ? 0 : inWindow[inWindow.length - count] + ms - now + 5;
      });
      const wait = Math.max(...waits);
      if (wait <= 0) {
        this.#sent.push(now);
        return;
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export class RiotClient {
  #key;
  #limiters = new Map();

  constructor(key) {
    if (!key) throw new Error('RIOT_API_KEY is not set. Put it in .env locally or in GitHub Actions secrets.');
    this.#key = key;
  }

  /** GET https://{host}.api.riotgames.com{path}. Returns parsed JSON, or null for 404. */
  async get(host, path) {
    if (!this.#limiters.has(host)) this.#limiters.set(host, new Limiter());
    const limiter = this.#limiters.get(host);
    for (let attempt = 0; attempt < 5; attempt++) {
      await limiter.take();
      const res = await fetch(`https://${host}.api.riotgames.com${path}`, { headers: { 'X-Riot-Token': this.#key } });
      if (res.ok) return res.json();
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        const retry = Number(res.headers.get('retry-after') ?? 2 ** attempt);
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new Error(`Riot API rejected the key (${res.status}). Development keys expire every 24 hours.`);
      throw new Error(`Riot API ${host}${path}: HTTP ${res.status}`);
    }
    throw new Error(`Riot API ${host}${path}: gave up after retries`);
  }
}

/** Platform host (ladders) → regional host (matches). */
export const REGIONS = [
  { platform: 'na1', regional: 'americas' },
  { platform: 'euw1', regional: 'europe' },
  { platform: 'kr', regional: 'asia' },
];

export const RANKED_SOLO = 420;

/** Riot's API key from the environment, loading the repo's .env when present. */
export function riotKeyFromEnv() {
  try {
    process.loadEnvFile(new URL('../../.env', import.meta.url));
  } catch {
    // No .env (e.g. GitHub Actions): use the environment as is.
  }
  return process.env.RIOT_API_KEY;
}

/** "16.19.1" from Data Dragon. Match gameVersion looks like "16.19.715.1234". */
export async function currentPatch() {
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const [major, minor] = versions[0].split('.');
  return `${major}.${minor}`;
}
