#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { clientFromEnv, DiscogsError } from "./discogs.js";
import {
  compactLine,
  computeStats,
  detailedItem,
  paginationHeader,
  truncate,
  type CollectionItem,
  type Pagination,
} from "./format.js";

const discogs = clientFromEnv();

const server = new McpServer({
  name: "discogs",
  version: "1.0.0",
});

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(error: unknown): ToolResult {
  const message =
    error instanceof DiscogsError && error.status === 401
      ? `${error.message}\nHint: set DISCOGS_TOKEN (personal access token from https://www.discogs.com/settings/developers) in the server's environment.`
      : error instanceof Error
        ? error.message
        : String(error);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

const paging = {
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page, max 100 (default 50)"),
};

// ---------------------------------------------------------------------------
// Database: search, releases, masters, artists, labels
// ---------------------------------------------------------------------------

server.registerTool(
  "search",
  {
    title: "Search Discogs",
    description:
      "Search the Discogs database for releases, masters, artists, or labels. Combine free-text `query` with filters like artist, year, format, or genre. Returns ids usable with get_release / get_master / get_artist / get_label.",
    inputSchema: {
      query: z.string().optional().describe("Free-text search query"),
      type: z
        .enum(["release", "master", "artist", "label"])
        .optional()
        .describe("Restrict results to one entity type"),
      artist: z.string().optional(),
      release_title: z.string().optional(),
      label: z.string().optional(),
      genre: z.string().optional().describe("e.g. 'Rock', 'Electronic', 'Jazz'"),
      style: z.string().optional().describe("e.g. 'Shoegaze', 'House', 'Bebop'"),
      country: z.string().optional(),
      year: z.string().optional().describe("Year, e.g. '1977'"),
      format: z.string().optional().describe("e.g. 'Vinyl', 'CD', 'Cassette'"),
      barcode: z.string().optional(),
      catno: z.string().optional().describe("Catalog number"),
      ...paging,
    },
  },
  async ({ query, ...rest }) => {
    try {
      const data = await discogs.request<{
        pagination: Pagination;
        results: Array<{
          id: number;
          type: string;
          title: string;
          year?: string;
          format?: string[];
          label?: string[];
          genre?: string[];
          country?: string;
          master_id?: number | null;
          catno?: string;
        }>;
      }>("/database/search", { q: query, ...rest });

      return ok({
        pagination: paginationHeader(data.pagination, "Search results"),
        results: data.results.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          year: r.year,
          format: r.format?.slice(0, 4),
          label: r.label?.slice(0, 2),
          genre: r.genre,
          country: r.country,
          catno: r.catno,
          master_id: r.master_id || undefined,
        })),
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_release",
  {
    title: "Get release",
    description:
      "Get full details for a specific Discogs release (a physical/digital edition): tracklist, formats, labels, community rating, and current marketplace availability.",
    inputSchema: {
      release_id: z.number().int().describe("Discogs release id"),
      currency: z
        .string()
        .optional()
        .describe("Currency for lowest_price, e.g. 'USD', 'EUR' (default USD)"),
    },
  },
  async ({ release_id, currency }) => {
    try {
      const r = await discogs.request<{
        id: number;
        master_id?: number;
        title: string;
        artists?: Array<{ name: string }>;
        year?: number;
        released?: string;
        country?: string;
        genres?: string[];
        styles?: string[];
        formats?: Array<{ name: string; qty: string; descriptions?: string[] }>;
        labels?: Array<{ name: string; catno: string }>;
        tracklist?: Array<{ position: string; title: string; duration?: string }>;
        community?: { rating?: { average: number; count: number }; have?: number; want?: number };
        num_for_sale?: number;
        lowest_price?: number | null;
        notes?: string;
      }>(`/releases/${release_id}`, { curr_abbr: currency || "USD" });

      return ok({
        release_id: r.id,
        master_id: r.master_id || undefined,
        artist: r.artists?.map((a) => a.name).join(", "),
        title: r.title,
        year: r.year,
        released: r.released,
        country: r.country,
        genres: r.genres,
        styles: r.styles,
        formats: r.formats?.map((f) =>
          [`${f.qty}x`, f.name, ...(f.descriptions ?? [])].join(" ")
        ),
        labels: r.labels?.map((l) => `${l.name} (${l.catno})`),
        tracklist: r.tracklist?.map((t) =>
          [t.position, t.title, t.duration].filter(Boolean).join(" — ")
        ),
        community: r.community && {
          rating: r.community.rating,
          have: r.community.have,
          want: r.community.want,
        },
        marketplace: {
          num_for_sale: r.num_for_sale,
          lowest_price: r.lowest_price,
        },
        notes: truncate(r.notes, 600),
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_master",
  {
    title: "Get master release",
    description:
      "Get a Discogs master release (the canonical entry grouping all editions of an album), including tracklist and the main release id.",
    inputSchema: {
      master_id: z.number().int().describe("Discogs master id"),
    },
  },
  async ({ master_id }) => {
    try {
      const m = await discogs.request<{
        id: number;
        title: string;
        artists?: Array<{ name: string }>;
        year?: number;
        genres?: string[];
        styles?: string[];
        tracklist?: Array<{ position: string; title: string; duration?: string }>;
        main_release?: number;
        num_for_sale?: number;
        lowest_price?: number | null;
      }>(`/masters/${master_id}`);

      return ok({
        master_id: m.id,
        artist: m.artists?.map((a) => a.name).join(", "),
        title: m.title,
        year: m.year,
        genres: m.genres,
        styles: m.styles,
        tracklist: m.tracklist?.map((t) =>
          [t.position, t.title, t.duration].filter(Boolean).join(" — ")
        ),
        main_release_id: m.main_release,
        marketplace: { num_for_sale: m.num_for_sale, lowest_price: m.lowest_price },
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_artist",
  {
    title: "Get artist",
    description:
      "Get a Discogs artist profile: bio, real name, aliases, band members, and name variations. Use get_artist_releases for their discography.",
    inputSchema: {
      artist_id: z.number().int().describe("Discogs artist id"),
    },
  },
  async ({ artist_id }) => {
    try {
      const a = await discogs.request<{
        id: number;
        name: string;
        realname?: string;
        profile?: string;
        namevariations?: string[];
        aliases?: Array<{ id: number; name: string }>;
        members?: Array<{ id: number; name: string; active?: boolean }>;
        urls?: string[];
      }>(`/artists/${artist_id}`);

      return ok({
        artist_id: a.id,
        name: a.name,
        realname: a.realname,
        profile: truncate(a.profile, 1500),
        namevariations: a.namevariations?.slice(0, 10),
        aliases: a.aliases?.map((x) => ({ id: x.id, name: x.name })),
        members: a.members?.map((m) => ({
          id: m.id,
          name: m.name,
          active: m.active,
        })),
        urls: a.urls?.slice(0, 5),
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_artist_releases",
  {
    title: "Get artist releases",
    description:
      "List an artist's discography (releases and masters), paginated. Roles distinguish main releases from appearances and track credits.",
    inputSchema: {
      artist_id: z.number().int().describe("Discogs artist id"),
      sort: z.enum(["year", "title", "format"]).optional(),
      sort_order: z.enum(["asc", "desc"]).optional(),
      ...paging,
    },
  },
  async ({ artist_id, ...rest }) => {
    try {
      const data = await discogs.request<{
        pagination: Pagination;
        releases: Array<{
          id: number;
          type?: string;
          title: string;
          year?: number;
          role?: string;
          artist?: string;
          format?: string;
          label?: string;
          main_release?: number;
        }>;
      }>(`/artists/${artist_id}/releases`, rest);

      return ok({
        pagination: paginationHeader(data.pagination, "Artist releases"),
        releases: data.releases.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          year: r.year,
          role: r.role,
          artist: r.artist,
          format: r.format,
          label: r.label,
          main_release_id: r.main_release,
        })),
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_label",
  {
    title: "Get label",
    description:
      "Get a Discogs record label profile, including parent label and sublabels.",
    inputSchema: {
      label_id: z.number().int().describe("Discogs label id"),
    },
  },
  async ({ label_id }) => {
    try {
      const l = await discogs.request<{
        id: number;
        name: string;
        profile?: string;
        contact_info?: string;
        parent_label?: { id: number; name: string };
        sublabels?: Array<{ id: number; name: string }>;
        urls?: string[];
      }>(`/labels/${label_id}`);

      return ok({
        label_id: l.id,
        name: l.name,
        profile: truncate(l.profile, 1500),
        contact_info: truncate(l.contact_info, 300),
        parent_label: l.parent_label,
        sublabels: l.sublabels?.slice(0, 20),
        urls: l.urls?.slice(0, 5),
      });
    } catch (error) {
      return fail(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Users: identity, profile, collection, wantlist, value
// ---------------------------------------------------------------------------

server.registerTool(
  "whoami",
  {
    title: "Who am I",
    description:
      "Return the Discogs identity of the configured personal access token. Use this to discover the default username for collection/wantlist tools.",
    inputSchema: {},
  },
  async () => {
    try {
      if (!discogs.hasToken) {
        return ok(
          "No DISCOGS_TOKEN configured. Public data tools still work" +
            (discogs.hasAuth ? " via consumer key/secret" : " (unauthenticated, lower rate limit)") +
            ", but identity, collection value, and price suggestions need a personal access token."
        );
      }
      const identity = await discogs.request<{
        id: number;
        username: string;
        resource_url: string;
        consumer_name?: string;
      }>("/oauth/identity");
      return ok(identity);
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_user_profile",
  {
    title: "Get user profile",
    description:
      "Get a Discogs user's public profile, including collection and wantlist counts.",
    inputSchema: {
      username: z.string().describe("Discogs username"),
    },
  },
  async ({ username }) => {
    try {
      const u = await discogs.request<{
        id: number;
        username: string;
        name?: string;
        profile?: string;
        location?: string;
        registered?: string;
        num_collection?: number;
        num_wantlist?: number;
        num_for_sale?: number;
        releases_contributed?: number;
        rating_avg?: number;
      }>(`/users/${encodeURIComponent(username)}`);

      return ok({
        username: u.username,
        name: u.name,
        profile: truncate(u.profile, 800),
        location: u.location,
        registered: u.registered,
        num_collection: u.num_collection,
        num_wantlist: u.num_wantlist,
        num_for_sale: u.num_for_sale,
        releases_contributed: u.releases_contributed,
        rating_avg: u.rating_avg,
      });
    } catch (error) {
      return fail(error);
    }
  }
);

interface CollectionPage {
  pagination: Pagination;
  releases: CollectionItem[];
}

interface WantlistPage {
  pagination: Pagination;
  wants: CollectionItem[];
}

server.registerTool(
  "get_user_collection",
  {
    title: "Get user collection",
    description:
      "Get a page of a user's record collection. Omit username to use the token owner's collection. The default compact view is one line per record ('id | Artist - Title (Year) [Genre] {Format} ★rating'); use view='detailed' for structured JSON.",
    inputSchema: {
      username: z
        .string()
        .optional()
        .describe("Discogs username (defaults to the token owner)"),
      sort: z
        .enum(["added", "artist", "title", "year", "rating"])
        .optional()
        .describe("Sort field (default 'added')"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Default 'desc'"),
      view: z
        .enum(["compact", "detailed"])
        .optional()
        .describe("Output format (default 'compact')"),
      ...paging,
    },
  },
  async ({ username, view, page, per_page, sort, sort_order }) => {
    try {
      const user = await discogs.resolveUsername(username);
      const data = await discogs.request<CollectionPage>(
        `/users/${encodeURIComponent(user)}/collection/folders/0/releases`,
        {
          page: page ?? 1,
          per_page: per_page ?? 50,
          sort: sort ?? "added",
          sort_order: sort_order ?? "desc",
        }
      );

      const header = paginationHeader(
        data.pagination,
        `Collection for ${user}`
      );
      if (view === "detailed") {
        return ok({ pagination: header, releases: data.releases.map(detailedItem) });
      }
      return ok(`${header}\n\n${data.releases.map(compactLine).join("\n")}`);
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_user_wantlist",
  {
    title: "Get user wantlist",
    description:
      "Get a page of a user's wantlist (records they want but don't own). Omit username to use the token owner's wantlist.",
    inputSchema: {
      username: z
        .string()
        .optional()
        .describe("Discogs username (defaults to the token owner)"),
      view: z
        .enum(["compact", "detailed"])
        .optional()
        .describe("Output format (default 'compact')"),
      ...paging,
    },
  },
  async ({ username, view, page, per_page }) => {
    try {
      const user = await discogs.resolveUsername(username);
      const data = await discogs.request<WantlistPage>(
        `/users/${encodeURIComponent(user)}/wants`,
        { page: page ?? 1, per_page: per_page ?? 50 }
      );

      const header = paginationHeader(data.pagination, `Wantlist for ${user}`);
      if (view === "detailed") {
        return ok({ pagination: header, wants: data.wants.map(detailedItem) });
      }
      return ok(`${header}\n\n${data.wants.map(compactLine).join("\n")}`);
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_collection_stats",
  {
    title: "Get collection stats",
    description:
      "Analyze a user's collection: genre/style/decade/format breakdowns and top artists. Fetches up to max_items most-recently-added records (100 per request, ~1s apart for rate limiting — large values take a while).",
    inputSchema: {
      username: z
        .string()
        .optional()
        .describe("Discogs username (defaults to the token owner)"),
      max_items: z
        .number()
        .int()
        .min(100)
        .max(2000)
        .optional()
        .describe("How many records to analyze, newest first (default 500)"),
    },
  },
  async ({ username, max_items }) => {
    try {
      const user = await discogs.resolveUsername(username);
      const cap = max_items ?? 500;
      const items: CollectionItem[] = [];
      let totalItems = 0;

      for (let page = 1; items.length < cap; page++) {
        const data = await discogs.request<CollectionPage>(
          `/users/${encodeURIComponent(user)}/collection/folders/0/releases`,
          { page, per_page: 100, sort: "added", sort_order: "desc" }
        );
        totalItems = data.pagination.items;
        items.push(...data.releases);
        if (page >= data.pagination.pages) break;
      }

      const stats = computeStats(items.slice(0, cap), totalItems);
      return ok({
        username: user,
        note:
          stats.itemsAnalyzed < stats.totalItems
            ? `Analyzed the ${stats.itemsAnalyzed} most recently added of ${stats.totalItems} records`
            : `Analyzed all ${stats.totalItems} records`,
        ...stats,
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.registerTool(
  "get_collection_value",
  {
    title: "Get collection value",
    description:
      "Get the estimated marketplace value (minimum/median/maximum) of the token owner's collection. Requires DISCOGS_TOKEN; only works for the authenticated user's own collection.",
    inputSchema: {},
  },
  async () => {
    try {
      const user = await discogs.resolveUsername();
      const value = await discogs.request<{
        minimum: string;
        median: string;
        maximum: string;
      }>(`/users/${encodeURIComponent(user)}/collection/value`);
      return ok({ username: user, ...value });
    } catch (error) {
      return fail(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

server.registerTool(
  "get_price_suggestions",
  {
    title: "Get price suggestions",
    description:
      "Get suggested marketplace prices for a release by condition grade (Mint, VG+, etc.). Requires DISCOGS_TOKEN with seller settings enabled on the account.",
    inputSchema: {
      release_id: z.number().int().describe("Discogs release id"),
    },
  },
  async ({ release_id }) => {
    try {
      const suggestions = await discogs.request<
        Record<string, { currency: string; value: number }>
      >(`/marketplace/price_suggestions/${release_id}`);
      return ok(suggestions);
    } catch (error) {
      return fail(error);
    }
  }
);

// ---------------------------------------------------------------------------

async function main() {
  if (!discogs.hasAuth) {
    console.error(
      "[discogs-mcp] Warning: no DISCOGS_TOKEN (or DISCOGS_CONSUMER_KEY/SECRET) set. " +
        "Search requires auth and unauthenticated requests are limited to 25/min."
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[discogs-mcp] Discogs MCP server running on stdio");
}

main().catch((error) => {
  console.error("[discogs-mcp] Fatal:", error);
  process.exit(1);
});
