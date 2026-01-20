import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
