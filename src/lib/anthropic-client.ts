import { createAnthropic } from "@ai-sdk/anthropic";

// Adapt `ai@4.x` / `@ai-sdk/anthropic@1.2.x` requests to what Claude Opus 5.5
// accepts. Every route goes through this, so the model-specific rules live in
// one place rather than in five route files.
//
// 1. Strip sampling params. `ai@4.x` defaults `temperature: 0` and provides no
//    way to omit it (ai/dist/index.mjs ~line 1619). Opus 4.7+ reject sampling
//    params outright.
//
// 2. Forced tool use → `auto`. `generateObject` / `streamObject` use
//    "object-tool" mode, which sends `tool_choice: {type: "tool", name: "json"}`.
//    Opus 5.5 returns a 400 for forced `tool` / `any`. We send `auto` and add a
//    system block naming the tool, which is the documented replacement. The
//    block is appended AFTER the existing (cached) system content, so the cache
//    prefix is unchanged.
//
// 3. A floor on `max_tokens`. Opus 5.5 always thinks (it cannot be disabled),
//    and thinking counts against `max_tokens`. The provider's default of 4096
//    would leave too little room for the listening-guide and analysis JSON after
//    thinking, and the output would be truncated mid-object.
const MIN_MAX_TOKENS = 16000;

function adapt(body: Record<string, unknown>): Record<string, unknown> {
  delete body.temperature;
  delete body.top_p;
  delete body.top_k;

  const choice = body.tool_choice as { type?: string; name?: string } | undefined;
  if (choice && (choice.type === "tool" || choice.type === "any")) {
    const tools = (body.tools as { name?: string }[] | undefined) || [];
    const name = choice.type === "tool" ? choice.name : tools[0]?.name;
    body.tool_choice = { type: "auto" };
    if (name) {
      const instruction = {
        type: "text",
        text: `Give your complete answer by calling the \`${name}\` tool exactly once. Do not reply in plain text.`,
      };
      const sys = body.system;
      body.system = Array.isArray(sys)
        ? [...sys, instruction]
        : typeof sys === "string" && sys
          ? [{ type: "text", text: sys }, instruction]
          : [instruction];
    }
  }

  if (typeof body.max_tokens !== "number" || body.max_tokens < MIN_MAX_TOKENS) {
    body.max_tokens = MIN_MAX_TOKENS;
  }
  return body;
}

const adaptFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        init = { ...init, body: JSON.stringify(adapt(parsed)) };
      }
    } catch {
      // body wasn't JSON — leave it alone (e.g. multipart, streams)
    }
  }
  return fetch(input, init);
};

export const anthropic = createAnthropic({ fetch: adaptFetch });
