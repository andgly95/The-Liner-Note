import { isShareToken, shelfForToken } from "@/lib/shelf";

export const dynamic = "force-dynamic";

// Installing from a shelf page installs that shelf: it opens straight to the
// wall, full screen, in the dark.
export function GET(_req: Request, { params }: { params: { token: string } }) {
  const shelf = shelfForToken(params.token);
  // The tablet's code only: the friends' link must never lead to it.
  if (!shelf || isShareToken(shelf, params.token)) return new Response("Not found", { status: 404 });
  const url = `/shelf/${shelf.token}`;
  return Response.json(
    {
      id: url,
      name: shelf.title,
      short_name: shelf.title.length > 14 ? "Records" : shelf.title,
      description: "A record collection, on display.",
      start_url: url,
      scope: url,
      display: "fullscreen",
      display_override: ["fullscreen", "standalone"],
      background_color: "#0b0b0c",
      theme_color: "#0b0b0c",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
