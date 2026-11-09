"use client";

// The frame around every social page: a one-line header, and on a phone a
// bottom bar — Home, Collection (the Discogs tools), You.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, Library, User, Disc3 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MeProvider, useMe } from "./me";
import { SignInButtons } from "./sign-in";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <Frame>{children}</Frame>
    </MeProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();
  const path = usePathname();
  const [signIn, setSignIn] = useState(false);
  const nav = [
    { href: "/home", label: "Home", icon: Home, on: path === "/home" },
    { href: "/dashboard", label: "Collection", icon: Library, on: path?.startsWith("/dashboard") },
    { href: me ? `/u/${me.handle}` : "#", label: "You", icon: User, on: !!me && path === `/u/${me.handle}` },
  ];
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/home" className="flex items-center gap-2.5 min-w-0">
            <div className="vinyl-record w-7 h-7 shrink-0" />
            <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap">The Liner Note</span>
          </Link>
          {loading ? null : me ? (
            <Link href={`/u/${me.handle}`} className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-accent">
              <Avatar className="w-8 h-8">
                <AvatarImage src={me.avatarUrl ?? undefined} alt="" />
                <AvatarFallback>{me.name[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-sm font-medium">@{me.handle}</span>
            </Link>
          ) : (
            <button onClick={() => setSignIn(true)} className="text-sm font-medium text-primary">
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28 md:pb-12">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur pb-safe" aria-label="Sections">
        <div className="grid grid-cols-3">
          {nav.map(({ href, label, icon: Icon, on }) => (
            <Link
              key={label}
              href={href}
              onClick={(e) => {
                if (href === "#") { e.preventDefault(); setSignIn(true); }
              }}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${on ? "text-primary" : "text-muted-foreground"}`}
            >
              <span className={`flex items-center justify-center w-12 h-7 rounded-full ${on ? "bg-primary/10" : ""}`}>
                <Icon className="w-5 h-5" />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {signIn && <SignInSheet onClose={() => setSignIn(false)} />}
    </div>
  );
}

export function SignInSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-card rounded-t-2xl sm:rounded-2xl p-6 pb-safe space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-2">
          <Disc3 className="w-8 h-8 text-primary" />
          <h2 className="font-display text-2xl font-semibold">Join The Liner Note</h2>
          <p className="text-sm text-muted-foreground">Log what you&apos;ve heard, rate albums and rank every track.</p>
        </div>
        <SignInButtons after={onClose} />
      </div>
    </div>
  );
}

/** For pages that need "sign in to do that" without owning the sheet. */
export function useSignInPrompt() {
  const [open, setOpen] = useState(false);
  return { open: () => setOpen(true), sheet: open ? <SignInSheet onClose={() => setOpen(false)} /> : null };
}
