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

const makeQuestions = (count) => Array.from({ length: count }, (_, index) => ({
  question: `Question ${index + 1}?`,
  options: ["Alpha", "Bravo", "Charlie", "Delta"],
  correctAnswerIndex: index % 4,
  explanation: `Explanation ${index + 1}.`
}));
const sampleQuestions = makeQuestions(6);

test("validates and trims quiz input", () => {
  assert.deepEqual(validateQuizInput({ topic: "  Biology  ", material: "  Cell notes  " }), {
    task: "quiz",
    topic: "Biology",
    material: "Cell notes",
    question: "",
    questionCount: 6
  });
  assert.throws(() => validateQuizInput({ topic: " ", material: "" }), { status: 400 });
});

test("validates CBT question counts from 1 through 100", () => {
  assert.equal(validateQuizInput({ topic: "Biology", questionCount: 1 }).questionCount, 1);
  assert.equal(validateQuizInput({ topic: "Biology", questionCount: 100 }).questionCount, 100);
  for (const questionCount of [0, 101, 1.5, "6", null]) {
    assert.throws(
      () => validateQuizInput({ topic: "Biology", questionCount }),
      { status: 400, message: /between 1 and 100/ }
    );
  }
});

test("accepts study material up to 200,000 characters and rejects larger input", () => {
  const material = "x".repeat(200_000);
  assert.equal(validateQuizInput({ topic: "Biology", material }).material.length, 200_000);
  assert.throws(
    () => validateQuizInput({ topic: "Biology", material: `${material}x` }),
    { status: 400 }
  );
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
    body: " ".repeat(1_000_001)
  });
  assert.equal(tooLarge.statusCode, 413);

  const lengthyMaterial = await netlifyStudyHandler({
    ...event,
    headers: { "x-nf-client-connection-ip": "198.51.100.57" },
    body: JSON.stringify({ task: "unsupported", material: "x".repeat(200_000) })
  });
  assert.equal(lengthyMaterial.statusCode, 400);
});

test("requires the Gemini key and does not rely on a Kimi key", async () => {
  const calls = [];
  await assert.rejects(
    generateStudyContent(
      { task: "quiz", topic: "Biology" },
      { kimiApiKey: "test-kimi-key" },
      async () => {
        calls.push("unexpected");
      }
    ),
    { status: 503, message: /GEMINI_API_KEY/ }
  );
  assert.deepEqual(calls, []);
});

test("uses only Gemini when its request fails, without falling back to Kimi", async () => {
  const calls = [];
  const originalError = console.error;
  console.error = (message) => calls.push(message);
  try {
    await assert.rejects(
      generateStudyContent(
        { task: "quiz", topic: "Biology" },
        { geminiApiKey: "test-gemini-key", kimiApiKey: "test-kimi-key" },
        async (url) => {
          calls.push(url);
          return { ok: false, status: 404, json: async () => ({}) };
        }
      ),
      { status: 502 }
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(calls.length, 2);
  assert.match(calls[0], /generativelanguage\.googleapis\.com/);
  assert.match(calls[1], /Gemini \(gemini-4-hydrogen\) returned HTTP 404/);
});

test("reports Gemini unavailability, quota limits, and timeouts with appropriate statuses", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const [providerStatus, expectedStatus, expectedMessage] of [
      [503, 503, /temporarily unavailable/],
      [429, 429, /quota reached/]
    ]) {
      await assert.rejects(
        generateStudyContent(
          { task: "quiz", topic: "Biology" },
          { geminiApiKey: "test-gemini-key" },
          async () => ({ ok: false, status: providerStatus, json: async () => ({}) })
        ),
        { status: expectedStatus, message: expectedMessage }
      );
    }

    await assert.rejects(
      generateStudyContent(
        { task: "quiz", topic: "Biology" },
        { geminiApiKey: "test-gemini-key" },
        async () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        }
      ),
      { status: 504, message: /Gemini took too long to respond/ }
    );
  } finally {
    console.error = originalError;
  }
});

test("retries a transient Gemini 503 and succeeds without using another provider", async () => {
  let calls = 0;
  const result = await generateStudyContent(
    { task: "quiz", topic: "Biology" },
    { geminiApiKey: "test-gemini-key", kimiApiKey: "unused-kimi-key" },
    async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: sampleQuestions }) }] } }]
        })
      };
    }
  );

  assert.equal(calls, 2);
  assert.equal(result.questions.length, 6);
});

test("uses Gemini Flash-Lite for long study material without truncating it", async () => {
  const material = "Long study notes. ".repeat(2_000);
  let capturedUrl;
  let capturedBody;
  await generateStudyContent(
    { task: "quiz", topic: "Biology", material },
    { geminiApiKey: "test-gemini-key" },
    async (url, options) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: sampleQuestions }) }] } }]
        })
      };
    }
  );

  assert.match(capturedUrl, /models\/gemini-3\.5-flash-lite:generateContent/);
  assert.ok(capturedBody.contents[0].parts[0].text.includes(material.trim()));
  assert.equal(capturedBody.generationConfig.thinkingConfig.thinkingLevel, "minimal");
});

test("generates exactly the requested number of CBT questions", async () => {
  for (const questionCount of [1, 100]) {
    let capturedPrompt;
    let thinkingLevel;
    const result = await generateStudyContent(
      { task: "quiz", topic: "Biology", questionCount },
      { geminiApiKey: "test-gemini-key" },
      async (_url, options) => {
        const request = JSON.parse(options.body);
        capturedPrompt = request.contents[0].parts[0].text;
        thinkingLevel = request.generationConfig.thinkingConfig.thinkingLevel;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({ questions: makeQuestions(questionCount) }) }]
              }
            }]
          })
        };
      }
    );

    assert.match(capturedPrompt, new RegExp(`Create exactly ${questionCount} `));
    assert.equal(thinkingLevel, "medium");
    assert.equal(result.questions.length, questionCount);
  }
});

test("generates and validates AI flashcards", async () => {
  const result = await generateStudyContent(
    { task: "flashcards", topic: "Biology", material: "Cell notes" },
    { geminiApiKey: "test-gemini-key" },
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                cards: [{ question: " What is a cell? ", answer: " The basic unit of life. " }]
              })
            }]
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
  const geminiResponse = (value) => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }]
    })
  });
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    const prompt = request.contents[0].parts[0].text;
    return prompt.includes("Student question:")
      ? geminiResponse({ answer: "A cell is the basic unit of life." })
      : geminiResponse({ plan: "1. Review notes.\n2. Test yourself.\n3. Review missed ideas." });
  };
  const keys = { geminiApiKey: "test-gemini-key" };

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
  let capturedBody;
  const result = await generateQuiz(
    { topic: "Biology", material: "Cell notes" },
    "test-only-server-key",
    async (url, options) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);
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
  assert.match(capturedUrl, /models\/gemini-4-hydrogen:generateContent/);
  assert.equal(capturedHeaders["x-goog-api-key"], "test-only-server-key");
  assert.equal(capturedBody.generationConfig.thinkingConfig.thinkingLevel, "medium");
  assert.equal(result.questions.length, 6);
  assert.equal(JSON.stringify(result).includes("test-only-server-key"), false);
});

test("serves the app and reports a missing server key without exposing a key field", async (context) => {
  const previousKeys = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
  };
  delete process.env.GEMINI_API_KEY;

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
  const pageHtml = await page.text();
  assert.match(pageHtml, /href="cbt\.html">Practice<\/a>/);
  assert.match(pageHtml, /assistant\.js/);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);

  for (const publicFile of ["study-api.js", "assistant.js", "favicon.svg"]) {
    const response = await fetch(`${baseUrl}/${publicFile}`);
    assert.equal(response.status, 200, `${publicFile} should be publicly served`);
  }

  const backendSource = await fetch(`${baseUrl}/server.mjs`);
  assert.equal(backendSource.status, 404);

  const practicePage = await fetch(`${baseUrl}/cbt.html`);
  assert.equal(practicePage.status, 200);
  assert.match(await practicePage.text(), /Find your/);

  for (const [file, pageTitle] of [
    ["flashcards.html", /Make it/],
    ["create.html", /Make learning/],
    ["progress.html", /Your steady/]
  ]) {
    const response = await fetch(`${baseUrl}/${file}`);
    assert.equal(response.status, 200, `${file} should be publicly served`);
    assert.match(await response.text(), pageTitle);
  }

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
