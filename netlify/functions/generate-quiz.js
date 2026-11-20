"use strict";

function respond(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

const MAX_BODY_BYTES = 200_000;
let rateLimiter;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Use POST to request a study activity." }, { Allow: "POST" });
  }

  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([name, value]) => [name.toLowerCase(), value])
  );
  const clientIp = headers["x-nf-client-connection-ip"] || "unknown";
  if (!rateLimiter) {
    const { createRateLimiter } = await import("../../server.mjs");
    rateLimiter = createRateLimiter();
  }
  const rate = rateLimiter(clientIp);
  const rateHeaders = {
    "RateLimit-Limit": "8",
    "RateLimit-Remaining": String(rate.remaining)
  };
  if (!rate.allowed) {
    return respond(429, { error: "Too many study requests. Please wait a minute and try again." }, {
      ...rateHeaders,
      "Retry-After": String(rate.retryAfterSeconds)
    });
  }

  let input;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return respond(413, { error: "The request is too large. Shorten your study material and try again." }, rateHeaders);
    }
    input = JSON.parse(body);
  } catch {
    return respond(400, { error: "The request body must be valid JSON." }, rateHeaders);
  }

  try {
    const { generateStudyContent } = await import("../../server.mjs");
    const result = await generateStudyContent(input, {
      geminiApiKey: process.env.GEMINI_API_KEY
    });
    return respond(200, result, rateHeaders);
  } catch (error) {
    const statusCode = Number.isInteger(error?.status) ? error.status : 500;
    const message = error instanceof Error
      ? error.message
      : "Something went wrong while preparing your study activity. Please try again.";
    if (statusCode === 500) console.error("Netlify study function failed.", error);
    return respond(statusCode, { error: message }, rateHeaders);
  }
};
