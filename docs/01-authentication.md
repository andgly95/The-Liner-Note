# Authentication & Discogs Integration

The app authenticates users via **Discogs OAuth 1.0a**, implemented from scratch
(HMAC-SHA1 signing, percent-encoding, signature base strings) in
`src/lib/discogs.ts`. Sessions are stored entirely in an httpOnly cookie — there
is no database or session store.

## File manifest

| File | Role |
|------|------|
| `src/lib/discogs.ts` | `DiscogsClient` class + OAuth signing helpers (lines 80–368) |
| `src/app/api/auth/discogs/route.ts` | Initiate OAuth (request token → redirect) |
| `src/app/api/auth/discogs/callback/route.ts` | Exchange verifier for access token, set session |
| `src/app/api/auth/session/route.ts` | Session introspection endpoint |
| `src/app/api/auth/logout/route.ts` | Logout (POST-only) |
| `src/app/api/collection/route.ts` | Fetch (own or public) collection |
| `src/app/api/wantlist/route.ts` | Fetch (own or public) wantlist |
| `src/types/discogs.ts` | Discogs + session type definitions |

## OAuth 1.0a flow

### Step 1 — Request token (`GET /api/auth/discogs`)

1. Handler calls `discogsClient.getRequestToken(callbackUrl)` (`discogs.ts:98`).
2. Builds OAuth params (`oauth_consumer_key`, `oauth_nonce` = 16 random hex bytes,
   `oauth_signature_method = HMAC-SHA1`, `oauth_timestamp` = unix seconds,
   `oauth_callback`).
3. Signs with `createSignature()` and `GET`s `https://api.discogs.com/oauth/request_token`.
4. Sets two **10-minute** cookies: `discogs_request_token` and
   `discogs_request_token_secret` (`httpOnly`, `sameSite=lax`, `secure` when the
   app URL is https).
5. Redirects to `https://www.discogs.com/oauth/authorize?oauth_token=<token>`.

### Step 2 — User authorizes on Discogs

Discogs redirects back to
`/api/auth/discogs/callback?oauth_token=<token>&oauth_verifier=<verifier>`.

### Step 3 — Access token (`GET /api/auth/discogs/callback`)

1. Reads `oauth_token` / `oauth_verifier` from the query, and the request-token
   cookies. Validates the returned token matches the cookie (CSRF guard).
2. `getAccessToken()` (`discogs.ts:150`) `POST`s to
   `https://api.discogs.com/oauth/access_token` with the verifier; the signing key
   now includes the request-token secret.
3. `getIdentity()` (`discogs.ts:244`) calls `/oauth/identity` with the new access
   token to fetch `{ id, username, avatar_url, ... }`.
4. Deletes the request-token cookies and writes `discogs_session` (see below).
5. Redirects to `/dashboard`.

### Error redirects (callback)

| Condition | Redirect |
|-----------|----------|
| Missing OAuth params | `/?error=missing_params` |
| Request-token cookies gone (>10 min) | `/?error=session_expired` |
| `oauth_token` ≠ cookie | `/?error=token_mismatch` |
| Exchange / identity fetch throws | `/?error=callback_failed` |

## OAuth signing internals (`src/lib/discogs.ts`)

- **`percentEncode(str)`** (`:37`) — `encodeURIComponent` plus manual encoding of
  `!'()*` to satisfy OAuth 1.0a (`'` → `%27`, etc.).
- **`createSignature(method, url, params, consumerSecret, tokenSecret)`** (`:44`):
  1. Sort params by key, percent-encode each `key=value`, join with `&`.
  2. Signature base = `METHOD & percentEncode(url) & percentEncode(sortedParams)`.
  3. Signing key = `percentEncode(consumerSecret) & percentEncode(tokenSecret)`
     (token secret is empty at step 1, the request-token secret at step 3).
  4. `HMAC-SHA1(signingKey, base)` → **base64** digest.
- **`buildAuthHeader(params)`** (`:73`) — emits `OAuth key="percentEncoded", …`.

## Session cookie

`discogs_session` (set in callback `:72`) — JSON of:

```json
{
  "user":   { "id": 12345, "username": "vinyl_lover", "avatar_url": "https://…" },
  "tokens": { "accessToken": "…", "accessTokenSecret": "…" }
}
```

Attributes: `httpOnly: true`, `sameSite: "lax"`, `secure` iff `NEXT_PUBLIC_APP_URL`
is https, `maxAge` **30 days**.

Every protected route reads + `JSON.parse`s this cookie directly; missing/invalid
→ 401. There is **no re-validation against Discogs** — the access tokens in the
cookie are used implicitly.

- **`GET /api/auth/session`** returns `{ authenticated: true, user }` or
  `{ authenticated: false }` (also false on malformed JSON).
- **`POST /api/auth/logout`** deletes the cookie. **POST-only by design** — a GET
  handler would let any third-party `<img src>` log the user out (CSRF). Note it
  does **not** revoke tokens server-side at Discogs.

## Collection & wantlist fetching

`GET /api/collection` and `GET /api/wantlist`:

1. Require a valid `discogs_session`.
2. Resolve target user: `?username=<name>` (browse any **public** collection using
   the caller's own tokens) or default to the authenticated user. The response
   includes `isOwnCollection` / `isOwnWantlist`.
3. Fetch all pages, then `optimizeCollectionForLLM()` + `collectionToString()`.
4. Return `{ username, isOwnCollection, totalItems, optimized, collectionString, raw }`.
   `raw` is capped at **2000** items for collections (`MAX_BROWSER_ITEMS`) / **50**
   for wantlists to bound payload size; `optimized` carries the compressed form.

## Rate limiting & pagination

`getFullCollection` / `getFullWantlist` (`discogs.ts:271`, `:340`):

- 100 items/page, sorted `added` desc for collections.
- First page determines `pagination.pages` / `pagination.items`.
- **Hard-coded 1s `setTimeout` between pages** to stay under Discogs' 60 req/min.
  Large collections therefore take real wall-clock time.
- Optional `onProgress(current, total)` callback (defined but **not** wired up by
  the API routes — no SSE/WebSocket progress to the client).

`authenticatedRequest<T>()` (`:202`) is the shared signed-request helper used by
`getIdentity`, `getCollectionPage`, `getWantlistPage`, and `getReleaseDetail`
(the last fetches `/releases/{id}` for tracklists and has **no** rate-limit delay).

## `DiscogsClient` surface

Exported singleton `discogsClient` (`discogs.ts:368`). Methods:
`getRequestToken`, `getAccessToken`, `getIdentity`, `getCollectionPage`,
`getFullCollection`, `getWantlistPage`, `getFullWantlist`, `getReleaseDetail`.
User-Agent is `TheLinerNote/1.0`. Consumer key/secret come from
`DISCOGS_CONSUMER_KEY` / `DISCOGS_CONSUMER_SECRET` (warns, but does not hard-fail,
if missing).

## Gotchas & edge cases

- **No refresh tokens** — OAuth 1.0a access tokens are long-lived (30-day cookie);
  if Discogs revokes server-side the user just gets a 401 with no friendly message.
- **`getReleaseDetail` has no rate-limit delay** — batch tracklist fetches must
  throttle themselves (the mixtape route does, ~1/s, see doc 02).
- **`?username=` is unvalidated** — relies on Discogs to 404 / reject private
  collections (surfaced to the UI as a "private" error).
- **`callback_failed`** is overloaded across two distinct failure points (token
  exchange vs. identity fetch).
