"use client";

// Point the phone at the barcode on the back of the sleeve.
//
// The browser's own BarcodeDetector where there is one (Chrome on Android —
// fast, native); ZXing everywhere else, which is what iPhones need. ZXing is
// loaded only when the camera opens, so nobody pays for it until they scan.
// Typing the digits is always there too: a worn sticker, a dim shop, a camera
// that says no.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard, Loader2 } from "lucide-react";
import { barcodeDigits } from "@/lib/pressing";

interface Props {
  onCode: (code: string) => void;
  onClose: () => void;
}

type Native = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const FORMATS = ["ean_13", "upc_a", "ean_8", "upc_e"];

// Good reads only: a 1D scan of a scuffed sleeve occasionally invents a digit,
// so a code has to be seen twice running before it counts — and EAN/UPC carry
// a check digit, so anything failing it is ignored outright.
function checkDigitOk(d: string): boolean {
  if (![8, 12, 13].includes(d.length)) return d.length >= 6; // UPC-E etc: trust the reader
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function BarcodeScanner({ onCode, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "nocamera">("starting");
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const done = useRef(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let raf = 0;
    let cancelled = false;

    const seen = (raw: string) => {
      const d = barcodeDigits(raw);
      if (done.current || !checkDigitOk(d)) return;
      if (last.current !== d) {
        last.current = d;
        return;
      }
      done.current = true;
      navigator.vibrate?.(40);
      onCode(d);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState("nocamera");
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Native }).BarcodeDetector;
      let native: Native | null = null;
      if (Detector) {
        try {
          const supported: string[] = await (Detector as unknown as { getSupportedFormats: () => Promise<string[]> }).getSupportedFormats();
          if (FORMATS.some((f) => supported.includes(f))) native = new Detector({ formats: FORMATS.filter((f) => supported.includes(f)) });
        } catch {
          native = null;
        }
      }

      try {
        if (native) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) return;
          const v = video.current!;
          v.srcObject = stream;
          await v.play();
          setState("scanning");
          const tick = async () => {
            if (cancelled || done.current) return;
            try {
              if (v.readyState >= 2) for (const c of await native!.detect(v)) seen(c.rawValue);
            } catch {
              /* a frame that failed to decode */
            }
            raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          const [{ BrowserMultiFormatOneDReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);
          if (cancelled) return;
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.UPC_E,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 60 });
          const controls = await reader.decodeFromConstraints(constraints, video.current!, (result) => {
            if (result) seen(result.getText());
          });
          if (cancelled) return controls.stop();
          stopZxing = () => controls.stop();
          setState("scanning");
        }
      } catch (e) {
        const name = (e as Error)?.name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "nocamera");
        setTyping(true);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  const submitTyped = () => {
    const d = barcodeDigits(typed);
    if (d.length >= 8) onCode(d);
  };

  // Into <body>: an ancestor with a transform would otherwise become the box
  // that "fixed" is relative to, and the page would show around the edges.
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col" role="dialog" aria-label="Scan a barcode">
      <div className="flex items-center justify-between px-4 h-14 shrink-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <span className="text-sm font-medium">Scan the barcode on the sleeve</span>
        <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {state === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* A wide letterbox — barcodes are wide, and a square frame makes people hold the phone too close */}
            <div className="relative w-[78%] max-w-md aspect-[2.4/1] rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80">
              <div className="absolute inset-x-3 top-1/2 h-0.5 bg-red-500/80 animate-pulse" />
            </div>
          </div>
        )}
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-white/70" />
          </div>
        )}
        {(state === "denied" || state === "nocamera") && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white/80">
            {state === "denied"
              ? "Camera access was refused. Allow it for this site in your browser settings, or type the numbers below."
              : "No camera available here — type the numbers under the barcode instead."}
          </div>
        )}
      </div>

      <div className="shrink-0 p-4 space-y-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {typing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="numeric"
              placeholder="0 77774 64462 4"
              className="flex-1 min-w-0 rounded-full bg-white/10 px-4 py-2.5 text-base font-mono placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/50"
            />
            <button
              type="submit"
              disabled={barcodeDigits(typed).length < 8}
              className="rounded-full bg-white text-black px-5 text-sm font-medium disabled:opacity-40"
            >
              Find
            </button>
          </form>
        ) : (
          <button onClick={() => setTyping(true)} className="w-full flex items-center justify-center gap-2 text-sm text-white/80 py-2">
            <Keyboard className="w-4 h-4" /> Type the numbers instead
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
