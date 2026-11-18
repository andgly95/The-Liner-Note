import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isShareToken, itemsForClient, shelfForToken, shelfItems } from "@/lib/shelf";
import { ShelfDisplay } from "@/components/shelf/shelf-display";

export const dynamic = "force-dynamic";

// The shelf display: someone's record collection, full screen, for a tablet on
// the shelf. Its own manifest, so "Add to Home Screen" here opens THIS shelf.
export function generateMetadata({ params }: { params: { token: string } }): Metadata {
  const shelf = shelfForToken(params.token);
  const title = shelf?.title ?? "The Liner Note";
  return {
    title,
    description: "A record collection, on display.",
    robots: { index: false, follow: false },
    // Only the tablet installs as the shelf; a friend's phone keeps the app's.
    manifest: shelf && !isShareToken(shelf, params.token) ? `/shelf/${shelf.token}/manifest.webmanifest` : undefined,
    appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b0c",
  colorScheme: "dark",
};

export default async function ShelfPage({ params }: { params: { token: string } }) {
  const shelf = shelfForToken(params.token);
  if (!shelf) notFound();
  // Hand over the snapshot with the page when there is one: a cheap tablet
  // paints the wall straight away instead of waiting on a second request.
  const shared = isShareToken(shelf, params.token);
  const token = shared ? shelf.share_token! : shelf.token;
  // (shelfItems also starts the Pi's background fetch of pages and covers.)
  const initial = shelf.snapshot && shelf.snapshot_at ? await shelfItems(shelf).catch(() => null) : null;
  // The friends' link is the same wall to browse on a phone — no slideshow,
  // no screen kept on — and its own token is the one its requests carry.
  return (
    <ShelfDisplay
      token={token}
      title={shelf.title}
      initial={initial && { items: itemsForClient(initial.items, token), at: initial.at }}
      kiosk={!shared}
    />
  );
}
