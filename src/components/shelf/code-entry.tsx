"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useShelfLook } from "./shelf-display";

export function ShelfCodeEntry() {
  const router = useRouter();
  useShelfLook();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = code.toLowerCase().replace(/[^a-z0-9]/g, "");

  const go = async () => {
    if (clean.length !== 10) return setError("Codes are ten letters and numbers, like abcde-23456.");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/shelf/${clean}`, { method: "HEAD" }).catch(() => null);
    if (res && res.status === 404) {
      setBusy(false);
      return setError("No shelf has that code. Check it on your profile, under Shelf display.");
    }
    router.push(`/shelf/${clean}`);
  };

  return (
    <main className="fixed inset-0 bg-[#0b0b0c] text-white flex items-center justify-center p-6">
      <form
        onSubmit={(e) => { e.preventDefault(); go(); }}
        className="w-full max-w-md flex flex-col items-center text-center gap-6 animate-[shelf-rise_.7s_ease_both]"
      >
        <div className="w-16 h-16 rounded-full shelf-disc" />
        <div className="space-y-2">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Open a shelf</h1>
          <p className="text-white/55">Type the code from Shelf display on your profile.</p>
        </div>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          placeholder="abcde-23456"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          className="w-full text-center font-mono text-3xl tracking-[0.2em] bg-white/[0.06] rounded-2xl px-5 py-4 outline-none ring-1 ring-white/10 focus:ring-white/40 placeholder:text-white/20"
        />
        {error && <p className="text-sm text-[#ff8a7a]">{error}</p>}
        <button
          disabled={busy || clean.length < 10}
          className="inline-flex items-center gap-2 rounded-full bg-white text-black px-6 py-3 font-medium disabled:opacity-30 transition-opacity"
        >
          Open shelf <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </main>
  );
}
