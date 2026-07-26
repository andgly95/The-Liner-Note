# Discogs MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives Claude (Claude Code, Claude Desktop, or any MCP client) direct access to the Discogs API: database search, release/artist/label lookups, and your collection and wantlist.

It runs over stdio and is self-contained — it does not depend on the Next.js app, and it uses a Discogs **personal access token** instead of the app's OAuth 1.0a flow.

## Tools

| Tool | What it does | Auth needed |
| --- | --- | --- |
| `search` | Search releases, masters, artists, labels with filters | any |
| `get_release` | Release details: tracklist, formats, rating, lowest price | none |
| `get_master` | Master release (canonical album entry) | none |
| `get_artist` | Artist bio, aliases, members | none |
| `get_artist_releases` | Artist discography, paginated | none |
| `get_label` | Label profile, parent/sublabels | none |
| `get_user_profile` | Public user profile + counts | none |
| `whoami` | Identity of the configured token | token |
| `get_user_collection` | Collection page, compact one-line-per-record format | public: any, private: token |
| `get_user_wantlist` | Wantlist page | public: any, private: token |
| `get_collection_stats` | Genre/style/decade/format breakdowns, top artists | public: any, private: token |
| `get_collection_value` | Min/median/max marketplace value of your collection | token (owner only) |
| `get_price_suggestions` | Suggested prices per condition grade | token (seller settings) |

"any" = works unauthenticated but at a lower rate limit (25 req/min vs 60). Search strictly requires some form of auth.

## Setup

1. **Get a token**: [discogs.com/settings/developers](https://www.discogs.com/settings/developers) → "Generate new token". (Alternatively, the server falls back to `DISCOGS_CONSUMER_KEY`/`DISCOGS_CONSUMER_SECRET` — enough for search and public data, but not identity, collection value, or price suggestions.)

2. **Build**:

   ```bash
   cd mcp-server
   npm install
   npm run build
   ```

## Connecting

### Claude Code

The repo ships a `.mcp.json` that starts the server automatically for anyone who opens this project — it reads `DISCOGS_TOKEN` from your shell environment. Or register it manually:

```bash
claude mcp add discogs -e DISCOGS_TOKEN=your_token -- node /absolute/path/to/The-Liner-Note/mcp-server/dist/index.js
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "discogs": {
      "command": "node",
      "args": ["/absolute/path/to/The-Liner-Note/mcp-server/dist/index.js"],
      "env": {
        "DISCOGS_TOKEN": "your_personal_access_token"
      }
    }
  }
}
```

## Notes

- **Rate limiting**: requests are spaced ~1.1s apart and 429s are retried with backoff, so the server stays under Discogs' 60 req/min limit on its own. `get_collection_stats` with a large `max_items` makes one request per 100 records, so analyzing 2,000 records takes ~20s.
- **Collection output** uses the same token-efficient `Artist - Title (Year) [Genre]` convention as the main app, with the release id prefixed so follow-up `get_release` calls can chain off it.
- `DISCOGS_PERSONAL_ACCESS_TOKEN` is accepted as an alias for `DISCOGS_TOKEN`.
