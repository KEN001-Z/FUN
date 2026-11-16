import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createAppServer, generateQuiz, validateQuizInput } from "./server.mjs";

const sampleQuestions = Array.from({ length: 6 }, (_, index) => ({
  question: `Question ${index + 1}?`,
  options: ["Alpha", "Bravo", "Charlie", "Delta"],
  correctAnswerIndex: index % 4,
  explanation: `Explanation ${index + 1}.`
}));

test("validates and trims quiz input", () => {
  assert.deepEqual(validateQuizInput({ topic: "  Biology  ", material: "  Cell notes  " }), {
    topic: "Biology",
    material: "Cell notes"
  });
  assert.throws(() => validateQuizInput({ topic: " ", material: "" }), { status: 400 });
});

test("sends the configured server key and returns validated questions", async () => {
  let capturedUrl;
  let capturedHeaders;
  const result = await generateQuiz(
    { topic: "Biology", material: "Cell notes" },
    "test-only-server-key",
    async (url, options) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify({ questions: sampleQuestions }) }]
            }
          }]
        })
      };
    }
  );

  assert.match(capturedUrl, /generativelanguage\.googleapis\.com/);
  assert.equal(capturedHeaders["x-goog-api-key"], "test-only-server-key");
  assert.equal(result.questions.length, 6);
  assert.equal(JSON.stringify(result).includes("test-only-server-key"), false);
});

test("serves the app and reports a missing server key without exposing a key field", async (context) => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    if (previousKey !== undefined) process.env.GEMINI_API_KEY = previousKey;
  }));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Little Loop AI makes your quiz/);

  const response = await fetch(`${baseUrl}/api/generate-quiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: "Biology", material: "" })
  });
  const result = await response.json();
  assert.equal(response.status, 503);
  assert.match(result.error, /GEMINI_API_KEY/);
  assert.equal("apiKey" in result, false);
});
