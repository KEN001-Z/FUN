import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  createAppServer,
  createRateLimiter,
  generateQuiz,
  generateStudyContent,
  validateQuizInput
} from "./server.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handler: netlifyStudyHandler } = require("./netlify/functions/generate-quiz.js");

const sampleQuestions = Array.from({ length: 6 }, (_, index) => ({
  question: `Question ${index + 1}?`,
  options: ["Alpha", "Bravo", "Charlie", "Delta"],
  correctAnswerIndex: index % 4,
  explanation: `Explanation ${index + 1}.`
}));

test("validates and trims quiz input", () => {
  assert.deepEqual(validateQuizInput({ topic: "  Biology  ", material: "  Cell notes  " }), {
    task: "quiz",
    topic: "Biology",
    material: "Cell notes",
    question: ""
  });
  assert.throws(() => validateQuizInput({ topic: " ", material: "" }), { status: 400 });
});

test("limits requests per client and resets after the window", () => {
  let now = 1000;
  const limitRequest = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.deepEqual(limitRequest("student-a"), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 1
  });
  assert.equal(limitRequest("student-a").allowed, true);
  assert.equal(limitRequest("student-a").allowed, false);
  assert.equal(limitRequest("student-b").allowed, true);
  now += 1000;
  assert.equal(limitRequest("student-a").allowed, true);
});

test("Netlify function bounds and rate-limits public study requests", async () => {
  const event = {
    httpMethod: "POST",
    headers: { "x-nf-client-connection-ip": "198.51.100.55" },
    body: JSON.stringify({ task: "unsupported" })
  };
  const first = await netlifyStudyHandler(event);
  assert.equal(first.statusCode, 400);
  assert.equal(first.headers["RateLimit-Limit"], "8");

  let limitedResponse;
  for (let request = 1; request < 9; request += 1) {
    limitedResponse = await netlifyStudyHandler(event);
  }
  assert.equal(limitedResponse.statusCode, 429);
  assert.match(limitedResponse.headers["Retry-After"], /^\d+$/);

  const tooLarge = await netlifyStudyHandler({
    ...event,
    headers: { "x-nf-client-connection-ip": "198.51.100.56" },
    body: " ".repeat(200_001)
  });
  assert.equal(tooLarge.statusCode, 413);
});

test("uses Kimi when Gemini fails and validates the study response", async () => {
  const calls = [];
  const result = await generateStudyContent(
    { task: "quiz", topic: "Biology", material: "Cell notes" },
    { geminiApiKey: "test-gemini-key", kimiApiKey: "test-kimi-key" },
    async (url, options) => {
      calls.push({ url, options });
      if (url.includes("generativelanguage")) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ questions: sampleQuestions }) } }]
        })
      };
    }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(calls[0].options.headers["x-goog-api-key"], "test-gemini-key");
  assert.match(calls[1].url, /api\.moonshot\.ai\/v1\/chat\/completions/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-kimi-key");
  assert.equal(JSON.parse(calls[1].options.body).response_format.type, "json_object");
  assert.equal(result.questions.length, 6);
});

test("generates and validates AI flashcards", async () => {
  const result = await generateStudyContent(
    { task: "flashcards", topic: "Biology", material: "Cell notes" },
    { kimiApiKey: "test-kimi-key" },
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              cards: [{ question: " What is a cell? ", answer: " The basic unit of life. " }]
            })
          }
        }]
      })
    })
  );
  assert.deepEqual(result, {
    cards: [{ question: "What is a cell?", answer: "The basic unit of life." }]
  });
});

test("generates tutor explanations and study plans", async () => {
  const kimiResponse = (value) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(value) } }]
    })
  });
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    const prompt = request.messages[1].content;
    return prompt.includes("Student question:")
      ? kimiResponse({ answer: "A cell is the basic unit of life." })
      : kimiResponse({ plan: "1. Review notes.\n2. Test yourself.\n3. Review missed ideas." });
  };
  const keys = { kimiApiKey: "test-kimi-key" };

  assert.deepEqual(
    await generateStudyContent({ task: "tutor", question: "What is a cell?" }, keys, fetchImpl),
    { answer: "A cell is the basic unit of life." }
  );
  assert.deepEqual(
    await generateStudyContent({ task: "study_plan", topic: "Cells" }, keys, fetchImpl),
    { plan: "1. Review notes.\n2. Test yourself.\n3. Review missed ideas." }
  );
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
  const previousKeys = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
    KIMI_API_KEY: process.env.KIMI_API_KEY
  };
  delete process.env.GEMINI_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  delete process.env.KIMI_API_KEY;

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    for (const [name, value] of Object.entries(previousKeys)) {
      if (value !== undefined) process.env[name] = value;
    }
  }));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /href="cbt\.html">Practice<\/a>/);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);

  const backendSource = await fetch(`${baseUrl}/server.mjs`);
  assert.equal(backendSource.status, 404);

  const practicePage = await fetch(`${baseUrl}/cbt.html`);
  assert.equal(practicePage.status, 200);
  assert.match(await practicePage.text(), /Find your/);

  const response = await fetch(`${baseUrl}/api/generate-quiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: "Biology", material: "" })
  });
  const result = await response.json();
  assert.equal(response.status, 503);
  assert.match(result.error, /GEMINI_API_KEY/);
  assert.equal("apiKey" in result, false);

  const invalidTask = await fetch(`${baseUrl}/api/study-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "unconfigured", topic: "Biology" })
  });
  assert.equal(invalidTask.status, 400);
});
