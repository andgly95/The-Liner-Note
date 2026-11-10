import { discogsClient, type DiscogsBarcodeSearch } from "@/lib/discogs";
import { paced } from "@/lib/pressing-server";
import { barcodeDigits, barcodeVariants } from "@/lib/pressing";
import { sessionOrNull, unauthorized } from "../_session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A barcode → the releases that carry it, grouped by album (master).
//
// Discogs' barcode search is loose: it matches the code as words, so the digits
// and the code as printed ("0 77774 64462 4") return different, overlapping
// sets, both with near-misses in them. So we ask both ways and keep only the
// releases whose barcode list contains exactly these digits.
const PAGES = 2;

type Hit = DiscogsBarcodeSearch["results"][number];

function printed(d: string): string | null {
  if (d.length === 12) return `${d[0]} ${d.slice(1, 6)} ${d.slice(6, 11)} ${d[11]}`; // UPC-A
  if (d.length === 13) return `${d[0]} ${d.slice(1, 7)} ${d.slice(7)}`; // EAN-13
  return null;
}

export async function GET(req: Request) {
  const session = await sessionOrNull();
  if (!session) return unauthorized();
  const code = barcodeDigits(new URL(req.url).searchParams.get("code") || "");
  if (code.length < 8 || code.length > 14) return Response.json({ error: "That isn't a barcode" }, { status: 400 });

  const wanted = new Set(barcodeVariants(code));
  const queries = new Set<string>();
  for (const v of Array.from(wanted)) {
    queries.add(v);
    const p = printed(v);
    if (p) queries.add(p);
  }

  const found = new Map<number, Hit>();
  try {
    for (const q of Array.from(queries).slice(0, 4)) {
      for (let page = 1; page <= PAGES; page++) {
        const res = await paced(() => discogsClient.searchBarcode(q, session.tokens, page));
        for (const r of res.results) {
          if ((r.barcode ?? []).some((b) => wanted.has(barcodeDigits(b)))) found.set(r.id, r);
        }
        if (page >= res.pagination.pages) break;
      }
    }
  } catch (e) {
    console.error("Barcode search failed:", e);
    return Response.json({ error: "Discogs didn't answer — try again in a moment" }, { status: 502 });
  }

  type Group = { id: number; title: string; year?: string; thumb?: string; releases: unknown[] };
  const byMaster = new Map<number, Group>();
  const loose: unknown[] = [];
  for (const r of Array.from(found.values())) {
    const row = {
      id: r.id,
      label: r.label?.[0] ?? "",
      country: r.country ?? "",
      format: (r.format ?? []).join(", "),
      catno: r.catno ?? "",
      released: r.year ?? "",
      thumb: r.thumb || r.cover_image,
      have: r.community?.have,
    };
    if (!r.master_id) {
      loose.push({ ...row, title: r.title });
      continue;
    }
    const m: Group = byMaster.get(r.master_id) ?? { id: r.master_id, title: r.title, year: undefined, thumb: r.cover_image || r.thumb, releases: [] };
    m.releases.push(row);
    if (r.year && (!m.year || r.year < m.year)) m.year = r.year;
    byMaster.set(r.master_id, m);
  }
  const masters = Array.from(byMaster.values()).sort((a, b) => b.releases.length - a.releases.length);
  return Response.json({ code, masters, loose });
}
