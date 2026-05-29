import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

function normalizeOpenAiBaseUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

function extractContent(message) {
  const content = message?.content?.trim();
  if (content) return content;
  return "";
}

const baseURL = normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL?.trim() ?? "");
const model = process.env.OPENAI_MODEL?.trim() || "llama3.1";
const maxTokens = Number(process.env.OPENAI_MAX_TOKENS ?? 4096);

console.log("Testing LLM connection...");
console.log("  baseURL:", baseURL);
console.log("  model:", model);
console.log("  maxTokens:", maxTokens);

const client = new OpenAI({
  baseURL,
  apiKey: process.env.OPENAI_API_KEY?.trim() || "unused",
  timeout: 180_000,
});

const start = Date.now();

try {
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: "Reply with exactly one word: connected" }],
    max_tokens: maxTokens,
  });
  const content = extractContent(response.choices[0]?.message);
  console.log("SUCCESS in", Date.now() - start, "ms");
  console.log("  reply:", content);
  console.log("  finish_reason:", response.choices[0]?.finish_reason);
  console.log("  completion_tokens:", response.usage?.completion_tokens);
  if (!content) {
    console.error("  WARNING: empty content; reasoning length:", response.choices[0]?.message?.reasoning?.length ?? 0);
    process.exit(1);
  }
} catch (error) {
  console.error("FAILED in", Date.now() - start, "ms");
  console.error("  error:", error instanceof Error ? error.message : error);
  process.exit(1);
}
