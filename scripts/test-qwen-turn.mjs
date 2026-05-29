import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  baseURL: "https://ollama.c.robpneu.com/v1",
  apiKey: process.env.OPENAI_API_KEY?.trim() || "unused",
  timeout: 180_000,
});

const model = "jaahas/qwen3.5-uncensored:9b";
const systemPrompt = `You are role-playing as a client in counseling. Reply in 1-4 sentences as the client only. Stay in character.`;

async function test(label, extra) {
  const start = Date.now();
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "thats 4?" },
      { role: "assistant", content: "That's 4" },
      { role: "user", content: "thats 4?" },
    ],
    max_tokens: 4096,
    temperature: 0.8,
    ...extra,
  });
  const msg = response.choices[0]?.message;
  console.log(`\n=== ${label} (${Date.now() - start}ms) ===`);
  console.log("content:", JSON.stringify(msg?.content));
  console.log("reasoning chars:", msg?.reasoning?.length ?? 0);
  console.log("finish:", response.choices[0]?.finish_reason);
  console.log("completion_tokens:", response.usage?.completion_tokens);
}

await test("default", {});
await test("think false", { think: false });
await test("max_tokens 8192", { max_tokens: 8192 });
