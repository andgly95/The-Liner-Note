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
}

export const discogsClient = new DiscogsClient();
