import type {
  DiscogsUser,
  DiscogsCollectionResponse,
  DiscogsWantlistResponse,
  DiscogsCollectionItem,
  DiscogsWantlistItem,
  DiscogsOAuthTokens,
  DiscogsReleaseDetail,
} from "@/types/discogs";
import * as crypto from "crypto";

const DISCOGS_API_URL = "https://api.discogs.com";
const DISCOGS_REQUEST_TOKEN_URL =
  "https://api.discogs.com/oauth/request_token";
const DISCOGS_AUTHORIZE_URL = "https://www.discogs.com/oauth/authorize";
const DISCOGS_ACCESS_TOKEN_URL = "https://api.discogs.com/oauth/access_token";

interface OAuthParams {
  oauth_consumer_key: string;
  oauth_nonce: string;
  oauth_signature: string;
  oauth_signature_method: string;
  oauth_timestamp: string;
  oauth_token?: string;
  oauth_verifier?: string;
  oauth_callback?: string;
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function createSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret = ""
): string {
  // Sort and encode parameters
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  // Create signature base string
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams),
  ].join("&");

  // Create signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  // Generate HMAC-SHA1 signature
  const hmac = crypto.createHmac("sha1", signingKey);
  hmac.update(signatureBase);
  return hmac.digest("base64");
}

function buildAuthHeader(params: OAuthParams): string {
  const authParams = Object.entries(params)
    .map(([key, value]) => `${key}="${percentEncode(value)}"`)
    .join(", ");
  return `OAuth ${authParams}`;
}

export class DiscogsClient {
  private consumerKey: string;
  private consumerSecret: string;
  private userAgent: string;

  constructor() {
    this.consumerKey = process.env.DISCOGS_CONSUMER_KEY || "";
    this.consumerSecret = process.env.DISCOGS_CONSUMER_SECRET || "";
    this.userAgent = "TheLinerNote/1.0";

    if (!this.consumerKey || !this.consumerSecret) {
      console.warn("Discogs API credentials not configured");
    }
  }

  /**
   * Step 1: Get request token for OAuth flow
   */
  async getRequestToken(callbackUrl: string): Promise<{
    requestToken: string;
    requestTokenSecret: string;
    authorizeUrl: string;
  }> {
    const params: Record<string, string> = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: generateNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: generateTimestamp(),
      oauth_callback: callbackUrl,
    };

    params.oauth_signature = createSignature(
      "GET",
      DISCOGS_REQUEST_TOKEN_URL,
      params,
      this.consumerSecret
    );

    const response = await fetch(DISCOGS_REQUEST_TOKEN_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: buildAuthHeader(params as unknown as OAuthParams),
        "User-Agent": this.userAgent,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get request token: ${text}`);
    }

    const text = await response.text();
    const data = new URLSearchParams(text);

    const requestToken = data.get("oauth_token");
    const requestTokenSecret = data.get("oauth_token_secret");

    if (!requestToken || !requestTokenSecret) {
      throw new Error("Invalid request token response");
    }

    const authorizeUrl = `${DISCOGS_AUTHORIZE_URL}?oauth_token=${requestToken}`;

    return { requestToken, requestTokenSecret, authorizeUrl };
  }

  /**
   * Step 3: Exchange request token + verifier for access token
   */
  async getAccessToken(
    requestToken: string,
    requestTokenSecret: string,
    verifier: string
  ): Promise<DiscogsOAuthTokens> {
    const params: Record<string, string> = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: generateNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: generateTimestamp(),
      oauth_token: requestToken,
      oauth_verifier: verifier,
    };

    params.oauth_signature = createSignature(
      "POST",
      DISCOGS_ACCESS_TOKEN_URL,
      params,
      this.consumerSecret,
      requestTokenSecret
    );

    const response = await fetch(DISCOGS_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: buildAuthHeader(params as unknown as OAuthParams),
        "User-Agent": this.userAgent,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get access token: ${text}`);
    }

    const text = await response.text();
    const data = new URLSearchParams(text);

    const accessToken = data.get("oauth_token");
    const accessTokenSecret = data.get("oauth_token_secret");

    if (!accessToken || !accessTokenSecret) {
      throw new Error("Invalid access token response");
    }

    return { accessToken, accessTokenSecret };
  }

  /**
   * Make an authenticated request to the Discogs API
   */
  private async authenticatedRequest<T>(
    method: string,
    endpoint: string,
    tokens: DiscogsOAuthTokens
  ): Promise<T> {
    const url = `${DISCOGS_API_URL}${endpoint}`;

    const params: Record<string, string> = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: generateNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: generateTimestamp(),
      oauth_token: tokens.accessToken,
    };

    params.oauth_signature = createSignature(
      method,
      url,
      params,
      this.consumerSecret,
      tokens.accessTokenSecret
    );

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: buildAuthHeader(params as unknown as OAuthParams),
        "User-Agent": this.userAgent,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discogs API error: ${response.status} - ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get the authenticated user's identity
   */
  async getIdentity(tokens: DiscogsOAuthTokens): Promise<DiscogsUser> {
    return this.authenticatedRequest<DiscogsUser>(
      "GET",
      "/oauth/identity",
      tokens
    );
  }

  /**
   * Get a page of the user's collection
   */
  async getCollectionPage(
    username: string,
    tokens: DiscogsOAuthTokens,
    page = 1,
    perPage = 100
  ): Promise<DiscogsCollectionResponse> {
    return this.authenticatedRequest<DiscogsCollectionResponse>(
      "GET",
      `/users/${username}/collection/folders/0/releases?page=${page}&per_page=${perPage}&sort=added&sort_order=desc`,
      tokens
    );
  }

  /**
   * Get the full collection (all pages)
   */
  async getFullCollection(
    username: string,
    tokens: DiscogsOAuthTokens,
    onProgress?: (current: number, total: number) => void
  ): Promise<DiscogsCollectionItem[]> {
    const allItems: DiscogsCollectionItem[] = [];

    // Get first page to know total
    const firstPage = await this.getCollectionPage(username, tokens, 1, 100);
    allItems.push(...firstPage.releases);

    const totalPages = firstPage.pagination.pages;
    const totalItems = firstPage.pagination.items;

    onProgress?.(allItems.length, totalItems);

    // Fetch remaining pages
    for (let page = 2; page <= totalPages; page++) {
      // Rate limiting: Discogs allows 60 requests per minute
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const pageData = await this.getCollectionPage(
        username,
        tokens,
        page,
        100
      );
      allItems.push(...pageData.releases);

      onProgress?.(allItems.length, totalItems);
    }

    return allItems;
  }

  /**
   * Get a page of the user's wantlist
   */
  async getWantlistPage(
    username: string,
    tokens: DiscogsOAuthTokens,
    page = 1,
    perPage = 100
  ): Promise<DiscogsWantlistResponse> {
    return this.authenticatedRequest<DiscogsWantlistResponse>(
      "GET",
      `/users/${username}/wants?page=${page}&per_page=${perPage}`,
      tokens
    );
  }

  /**
   * Get full release detail (incl. tracklist).
   * Used by the Mixtape Architect to ground sequencing in real tracks.
   */
  async getReleaseDetail(
    releaseId: number,
    tokens: DiscogsOAuthTokens
  ): Promise<DiscogsReleaseDetail> {
    return this.authenticatedRequest<DiscogsReleaseDetail>(
      "GET",
      `/releases/${releaseId}`,
      tokens
    );
  }

  /**
   * Get the full wantlist (all pages)
   */
  async getFullWantlist(
    username: string,
    tokens: DiscogsOAuthTokens,
    onProgress?: (current: number, total: number) => void
  ): Promise<DiscogsWantlistItem[]> {
    const allItems: DiscogsWantlistItem[] = [];

    const firstPage = await this.getWantlistPage(username, tokens, 1, 100);
    allItems.push(...firstPage.wants);

    const totalPages = firstPage.pagination.pages;
    const totalItems = firstPage.pagination.items;

    onProgress?.(allItems.length, totalItems);

    for (let page = 2; page <= totalPages; page++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const pageData = await this.getWantlistPage(username, tokens, page, 100);
      allItems.push(...pageData.wants);

      onProgress?.(allItems.length, totalItems);
    }

    return allItems;
  }

  /* ── Pressing finder ─────────────────────────────────────────────────── */

  /** Search masters (the "album" level that groups every pressing). */
  async searchMasters(query: string, tokens: DiscogsOAuthTokens): Promise<DiscogsSearchResponse> {
    return this.authenticatedRequest<DiscogsSearchResponse>(
      "GET",
      `/database/search?type=master&per_page=20&q=${encodeURIComponent(query)}`,
      tokens
    );
  }

  async getMaster(masterId: number, tokens: DiscogsOAuthTokens): Promise<DiscogsMaster> {
    return this.authenticatedRequest<DiscogsMaster>("GET", `/masters/${masterId}`, tokens);
  }

  /**
   * One page of a master's versions. Filters are ANDed by Discogs: a value list
   * for one key (format=Mono&format=LP) means "Mono AND LP". The response also
   * carries facet counts for what is left, which drive the filter chips.
   */
  async getMasterVersions(
    masterId: number,
    filters: Partial<Record<VersionFilterKey, string[]>>,
    tokens: DiscogsOAuthTokens,
    page = 1
  ): Promise<DiscogsVersionsResponse> {
    const qs = [`per_page=100`, `page=${page}`];
    for (const key of VERSION_FILTER_KEYS) {
      for (const v of filters[key] ?? []) qs.push(`${key}=${encodeURIComponent(v)}`);
    }
    return this.authenticatedRequest<DiscogsVersionsResponse>(
      "GET",
      `/masters/${masterId}/versions?${qs.join("&")}`,
      tokens
    );
  }

  /** Everything about one pressing — runouts, notes, companies, label details. */
  async getReleaseFull(releaseId: number, tokens: DiscogsOAuthTokens): Promise<DiscogsReleaseFull> {
    return this.authenticatedRequest<DiscogsReleaseFull>("GET", `/releases/${releaseId}`, tokens);
  }

  /**
   * Add a release to the signed-in user's collection, in folder 1
   * ("Uncategorized" — the only folder every account is guaranteed to have).
   * Discogs allows several instances of one release, so this never fails as a
   * duplicate; the caller checks first if that matters.
   */
  async addToCollection(
    username: string,
    releaseId: number,
    tokens: DiscogsOAuthTokens
  ): Promise<{ instance_id: number; resource_url: string }> {
    return this.authenticatedRequest(
      "POST",
      `/users/${encodeURIComponent(username)}/collection/folders/1/releases/${releaseId}`,
      tokens
    );
  }

  /** How many copies of this release the user already has (any folder). */
  async collectionInstances(
    username: string,
    releaseId: number,
    tokens: DiscogsOAuthTokens
  ): Promise<number> {
    const r = await this.authenticatedRequest<{ releases?: unknown[] }>(
      "GET",
      `/users/${encodeURIComponent(username)}/collection/releases/${releaseId}`,
      tokens
    );
    return r.releases?.length ?? 0;
  }
}

export const discogsClient = new DiscogsClient();

export const VERSION_FILTER_KEYS = ["format", "released", "country", "label"] as const;
export type VersionFilterKey = (typeof VERSION_FILTER_KEYS)[number];

export interface DiscogsSearchResponse {
  results: Array<{
    id: number;
    master_id?: number;
    title: string;
    year?: string;
    thumb?: string;
    cover_image?: string;
    format?: string[];
    country?: string;
  }>;
}

export interface DiscogsMaster {
  id: number;
  title: string;
  year?: number;
  artists?: { name: string }[];
  images?: { uri: string; uri150?: string; type: string }[];
}

export interface DiscogsVersion {
  id: number;
  title: string;
  label: string;
  country: string;
  format: string;
  catno: string;
  released: string;
  thumb?: string;
  major_formats?: string[];
  stats?: { community?: { in_collection?: number; in_wantlist?: number } };
}

export interface DiscogsVersionsResponse {
  pagination: { page: number; pages: number; items: number };
  filters: { applied: Record<string, string[]>; available: Record<string, Record<string, number>> };
  filter_facets?: Array<{ id: string; title: string; values: Array<{ title: string; value: string; count: number }> }>;
  versions: DiscogsVersion[];
}

export interface DiscogsReleaseFull {
  id: number;
  master_id?: number;
  title: string;
  year?: number;
  released?: string;
  country?: string;
  notes?: string;
  artists?: { name: string }[];
  labels?: { name: string; catno: string }[];
  formats?: { name: string; qty: string; text?: string; descriptions?: string[] }[];
  identifiers?: { type: string; value: string; description?: string }[];
  companies?: { name: string; entity_type_name: string }[];
  images?: { uri: string; uri150?: string; type: string }[];
  community?: { have?: number; want?: number };
}
