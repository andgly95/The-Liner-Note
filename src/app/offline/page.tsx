import Link from "next/link";
import { RetryButton } from "./retry";

// What the service worker shows for a page that was never opened while online.
// Precached at install, with its CSS, so it renders on a first-ever offline
// launch. Static on purpose: nothing here may need the network.
export const dynamic = "force-static";
export const metadata = { title: "Offline — The Liner Note" };

export default function Offline() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center bg-background">
      <div className="vinyl-record w-20 h-20" />
      <div className="space-y-2 max-w-xs">
        <h1 className="font-display text-2xl font-semibold">Between sides</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re offline, and this page hasn&apos;t been saved yet. Albums, artists and profiles you&apos;ve
          opened before still work.
        </p>
      </div>
      <div className="flex gap-2">
        <RetryButton />
        <Link href="/home" className="rounded-full border px-4 py-2 text-sm font-medium">
          Home
        </Link>
      </div>
    </main>
  );
}
