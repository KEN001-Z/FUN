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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Use POST to create a quiz." }, { Allow: "POST" });
  }

  let input;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";
    input = JSON.parse(body);
  } catch {
    return respond(400, { error: "The request body must be valid JSON." });
  }

  try {
    const { generateQuiz } = await import("../../server.mjs");
    const result = await generateQuiz(input, process.env.GEMINI_API_KEY);
    return respond(200, result);
  } catch (error) {
    const statusCode = Number.isInteger(error?.status) ? error.status : 500;
    const message = error instanceof Error
      ? error.message
      : "Something went wrong while making the quiz. Please try again.";
    if (statusCode === 500) console.error("Netlify quiz function failed.", error);
    return respond(statusCode, { error: message });
  }
};
