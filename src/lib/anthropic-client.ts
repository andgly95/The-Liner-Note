import { createAnthropic } from "@ai-sdk/anthropic";

// Strip `temperature` from outbound requests.
//
// Why: `ai@4.x` defaults `temperature: 0` and provides no way to omit it
// (see ai/dist/index.mjs around line 1619: `temperature != null ? temperature : 0`).
// Newer Anthropic models (Opus 4.7+) deprecate the parameter entirely and reject
// requests that include it. Older models ignore its absence and use their own
// defaults, so unconditional stripping is safe across the model lineup.
const stripTemperatureFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body);
      if (parsed && typeof parsed === "object" && "temperature" in parsed) {
        delete (parsed as { temperature?: unknown }).temperature;
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // body wasn't JSON — leave it alone (e.g. multipart, streams)
    }
  }
  return fetch(input, init);
};

export const anthropic = createAnthropic({ fetch: stripTemperatureFetch });
