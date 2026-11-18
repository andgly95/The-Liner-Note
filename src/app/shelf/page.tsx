import type { Metadata, Viewport } from "next";
import { ShelfCodeEntry } from "@/components/shelf/code-entry";

// On the tablet: type the shelf's code instead of a long link.
export const metadata: Metadata = { title: "Open a shelf — The Liner Note", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0b0b0c", colorScheme: "dark" };

export default function ShelfEntryPage() {
  return <ShelfCodeEntry />;
}
