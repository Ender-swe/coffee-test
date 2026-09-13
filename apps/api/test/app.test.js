import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(
  () =>
    new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
);

test("health endpoint returns JSON and omits framework header", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "orlast-api",
  });
});

test("unknown routes return a JSON 404", async () => {
  const response = await fetch(`${baseUrl}/api/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found" });
});

test("malformed JSON returns a sanitized 400", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request" });
});
