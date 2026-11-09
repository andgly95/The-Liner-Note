import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Oswald } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// The display face: headings set like the back of a sleeve.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });
// The Hard Bop theme's display face: tall, condensed, set in capitals — the
// lettering of 1950s–60s jazz sleeves.
const oswald = Oswald({ subsets: ["latin"], variable: "--font-condensed" });

// Applied before first paint, so a saved theme never flashes the default one.
// Per device, in localStorage: a theme is a preference about this screen.
const THEME_SCRIPT = `try{var t=localStorage.getItem("ln-theme");if(t&&t!=="paper")document.documentElement.dataset.theme=t}catch(e){}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f1e8",
};

export const metadata: Metadata = {
  title: "The Liner Note - AI-Powered Record Collection Analysis",
  description:
    "Get roasted, find gaps in your collection, and discover your next vinyl obsession with AI-powered analysis of your Discogs collection.",
  keywords: ["vinyl", "records", "discogs", "collection", "music", "AI"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${oswald.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
