import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("./study-api.js", import.meta.url), "utf8");

test("explains when the study endpoint returns HTML instead of JSON", async () => {
  const window = {};
  runInNewContext(source, {
    window,
    fetch: async () => ({
      status: 502,
      headers: { get: () => "text/html; charset=utf-8" }
    }),
    AbortController,
    setTimeout,
    clearTimeout
  });

  await assert.rejects(
    window.requestStudyTask("quiz", { topic: "Biology" }),
    /HTTP 502.*Pxxl runtime logs.*provider key is valid and active/
  );
});
