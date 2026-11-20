"use strict";

window.requestStudyTask = async function requestStudyTask(task, payload, options = {}) {
  const controller = options.signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 85000) : null;
  try {
    const response = await fetch("/api/study-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, task }),
      signal: options.signal || controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      if (response.status === 502) {
        throw new Error(
          "The study service returned HTTP 502. Check Pxxl runtime logs for AI provider errors, and verify that at least one configured provider key is valid and active."
        );
      }
      throw new Error(
        `The study service returned a non-JSON response (HTTP ${response.status}). ` +
        "Check that the page and API use the same deployed service, and that Pxxl is running this project as a Web Service with `node server.mjs` on port 3000."
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `The study service returned invalid JSON (HTTP ${response.status}). ` +
        "Check that the Node.js Web Service is running, then redeploy."
      );
    }
    if (response.status === 404 && data.error === "route not found") {
      throw new Error("The study API isn't running. In Pxxl, deploy this project as a Web Service with `node server.mjs` on port 3000, then redeploy.");
    }
    if (!response.ok) throw new Error(data.error || `The study service returned HTTP ${response.status}.`);
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request took too long. Try again with shorter study notes.");
    }
    if (error instanceof TypeError) {
      throw new Error("Couldn't reach Little Loop. Start the app server and try again.");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
