import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest and linked from every page by Next.
// Colours are the default "Liner notes" theme; the theme picker updates the
// live theme-color meta, but the splash screen is fixed at install time.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "The Liner Note",
    short_name: "Liner Note",
    description: "Log, rate and rank albums — and find the exact pressing in your hands.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f6f1e8",
    theme_color: "#f6f1e8",
    categories: ["music", "social", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon.
    shortcuts: [
      {
        name: "Find a pressing",
        short_name: "Pressings",
        description: "Scan a barcode or search runouts to find the exact release",
        url: "/dashboard?section=pressings",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Your collection",
        short_name: "Collection",
        url: "/dashboard?section=browse",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
