import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../lib/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(here, 'fixtures');

export interface FffClientOptions {
  base?: string;
  userAgent?: string;
  rateLimitMs?: number;
  cacheTtl?: number;
  cacheDir?: string;
  offline?: boolean;
  timeoutMs?: number;
  maxPages?: number;
  /** Injection possible pour les tests. */
  fetchImpl?: typeof fetch;
}

export class FffHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'FffHttpError';
  }
}

/**
 * Client HTTP pour l'API DOFA de la FFF.
 *
 * - respecte un delai minimum entre deux requetes (politesse envers le serveur)
 * - met en cache les reponses sur disque (TTL configurable)
 * - gere la pagination Hydra des collections API Platform
 * - sait fonctionner hors-ligne sur des fixtures locales (FFF_OFFLINE=1)
 */
export class FffClient {
  private readonly opts: Required<Omit<FffClientOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };
  private lastCall = 0;
  private queue: Promise<unknown> = Promise.resolve();
  requests = 0;
  cacheHits = 0;

  constructor(options: FffClientOptions = {}) {
    this.opts = {
      base: options.base ?? config.fff.base,
      userAgent: options.userAgent ?? config.fff.userAgent,
      rateLimitMs: options.rateLimitMs ?? config.fff.rateLimitMs,
      cacheTtl: options.cacheTtl ?? config.fff.cacheTtl,
      cacheDir: options.cacheDir ?? config.fff.cacheDir,
      offline: options.offline ?? config.fff.offline,
      timeoutMs: options.timeoutMs ?? config.fff.timeoutMs,
      maxPages: options.maxPages ?? config.fff.maxPages,
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  get isOffline(): boolean {
    return this.opts.offline;
  }

  buildUrl(pathname: string, params: Record<string, string | number | undefined> = {}): string {
    const url = new URL(this.opts.base.replace(/\/$/, '') + pathname);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** Recupere une ressource JSON, avec cache disque puis reseau (ou fixture en mode hors-ligne). */
  async get<T = unknown>(
    pathname: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = this.buildUrl(pathname, params);
    const cached = this.readCache<T>(url);
    if (cached !== undefined) {
      this.cacheHits += 1;
      return cached;
    }
    if (this.opts.offline) {
      const fixture = readFixture<T>(pathname);
      if (fixture === undefined) {
        throw new FffHttpError(
          0,
          url,
          `Mode hors-ligne : aucune fixture pour ${pathname}. Ajoutez un fichier dans src/fff/fixtures/ ou desactivez FFF_OFFLINE.`,
        );
      }
      return fixture;
    }
    const payload = await this.enqueue(() => this.fetchJson<T>(url));
    this.writeCache(url, payload);
    return payload;
  }

  /**
   * Recupere une collection paginee.
   * Accepte les trois formes rencontrees sur l'API FFF :
   * tableau brut, `hydra:member`, ou objet `{ items: [] }`.
   */
  async getCollection<T = unknown>(
    pathname: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= this.opts.maxPages; page += 1) {
      const payload = await this.get<unknown>(pathname, page === 1 ? params : { ...params, page });
      const items = extractMembers<T>(payload);
      out.push(...items);
      if (!hasNextPage(payload) || items.length === 0) break;
    }
    return out;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
        this.requests += 1;
        const res = await this.opts.fetchImpl(url, {
          headers: {
            accept: 'application/ld+json, application/json;q=0.9, */*;q=0.8',
            'accept-language': 'fr-FR,fr;q=0.9',
            'user-agent': this.opts.userAgent,
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) {
          throw new FffHttpError(res.status, url, `Reponse ${res.status} de la FFF`);
        }
        if (!res.ok) {
          throw new FffHttpError(res.status, url, `Reponse ${res.status} de la FFF pour ${url}`);
        }
        return (await res.json()) as T;
      } catch (error) {
        lastError = error;
        const retriable =
          error instanceof FffHttpError ? error.status === 429 || error.status >= 500 : true;
        if (!retriable || attempt === 2) break;
        await sleep(500 * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Serialise les appels et impose le delai minimum configure. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.opts.rateLimitMs - (Date.now() - this.lastCall);
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        this.lastCall = Date.now();
      }
    });
    this.queue = run.catch(() => undefined);
    return run as Promise<T>;
  }

  private cachePath(url: string): string {
    const key = crypto.createHash('sha1').update(url).digest('hex');
    return path.join(this.opts.cacheDir, `${key}.json`);
  }

  private readCache<T>(url: string): T | undefined {
    if (this.opts.cacheTtl <= 0) return undefined;
    const file = this.cachePath(url);
    try {
      const stat = fs.statSync(file);
      if ((Date.now() - stat.mtimeMs) / 1000 > this.opts.cacheTtl) return undefined;
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  private writeCache(url: string, payload: unknown): void {
    if (this.opts.cacheTtl <= 0) return;
    try {
      fs.mkdirSync(this.opts.cacheDir, { recursive: true });
      fs.writeFileSync(this.cachePath(url), JSON.stringify(payload));
    } catch {
      /* le cache est un confort, jamais une obligation */
    }
  }
}

export function extractMembers<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['hydra:member', 'member', 'items', 'data', 'results']) {
      const value = obj[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

export function hasNextPage(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const view = (payload as Record<string, unknown>)['hydra:view'];
  if (view && typeof view === 'object') {
    return Boolean((view as Record<string, unknown>)['hydra:next']);
  }
  return false;
}

function readFixture<T>(pathname: string): T | undefined {
  const file = path.join(FIXTURES_DIR, `${pathname.replace(/^\//, '').replace(/[/?=&]/g, '_')}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
