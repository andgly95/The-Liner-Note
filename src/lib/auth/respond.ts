import { PremiumRequired } from "@/lib/library";

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const needSignIn = () => json({ error: "Sign in first" }, 401);

/** Map the library's errors to HTTP — 402 for premium, 400 for bad input. */
export function libraryError(e: unknown) {
  if (e instanceof PremiumRequired) return json({ error: e.message, premium: true }, 402);
  if (e instanceof RangeError) return json({ error: e.message }, 400);
  console.error(e);
  return json({ error: "Something went wrong" }, 500);
}
