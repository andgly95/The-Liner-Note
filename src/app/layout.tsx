import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// The display face: headings set like the back of a sleeve.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });

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
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
