const API_URL = "https://api.discogs.com";
const USER_AGENT = "TheLinerNoteMCP/1.0 +https://github.com/andgly95/the-liner-note";

// Discogs allows 60 requests/min with auth, 25/min without. Space requests
// out rather than bursting so multi-page fetches never trip the limit.
const MIN_REQUEST_INTERVAL_MS = 1100;

export class DiscogsError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "DiscogsError";
  }
}

type Query = Record<string, string | number | undefined>;

export class DiscogsClient {
  private lastRequestAt = 0;
  private identity: { username: string } | null = null;

  constructor(
    private readonly token?: string,
    private readonly consumerKey?: string,
    private readonly consumerSecret?: string
  ) {}

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  get hasAuth(): boolean {
    return Boolean(this.token || (this.consumerKey && this.consumerSecret));
  }

  private authHeader(): string | undefined {
    if (this.token) return `Discogs token=${this.token}`;
    if (this.consumerKey && this.consumerSecret) {
      return `Discogs key=${this.consumerKey}, secret=${this.consumerSecret}`;
    }
    return undefined;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
  }

  async request<T>(path: string, query: Query = {}, attempt = 0): Promise<T> {
    await this.throttle();

    const url = new URL(`${API_URL}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    };
    const auth = this.authHeader();
    if (auth) headers.Authorization = auth;

    const response = await fetch(url, { headers });

    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 5;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.request<T>(path, query, attempt + 1);
    }

    if (!response.ok) {
      const body = await response.text();
      let message = body;
      try {
        message = (JSON.parse(body) as { message?: string }).message ?? body;
      } catch {
        // body was not JSON — use it as-is
      }
      throw new DiscogsError(
        `Discogs API ${response.status} on ${path}: ${message.slice(0, 300)}`,
        response.status
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Resolve a username: use the explicit one if given, otherwise fall back to
   * the identity of the configured personal access token.
   */
  async resolveUsername(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (!this.token) {
      throw new DiscogsError(
        "No username given and no DISCOGS_TOKEN configured to infer one from. Pass a username explicitly."
      );
    }
    if (!this.identity) {
      this.identity = await this.request<{ username: string }>("/oauth/identity");
    }
    return this.identity.username;
  }
}

export function clientFromEnv(): DiscogsClient {
  return new DiscogsClient(
    process.env.DISCOGS_TOKEN || process.env.DISCOGS_PERSONAL_ACCESS_TOKEN,
    process.env.DISCOGS_CONSUMER_KEY,
    process.env.DISCOGS_CONSUMER_SECRET
  );
}
