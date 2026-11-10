#!/usr/bin/env node
/**
 * Minimal GitHub API mock for Playwright media-upload tests. It is only
 * started by scripts/e2e-server.mjs and is never part of production.
 */
import http from "node:http";

const port = Number(process.env.E2E_GITHUB_PORT || 8789);
const host = "127.0.0.1";

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const path = url.pathname;

  if (request.method === "GET" && /^\/repos\/[^/]+\/[^/]+$/.test(path)) {
    json(response, 200, { private: false, permissions: { push: true } });
    return;
  }
  if (request.method === "GET" && /^\/repos\/[^/]+\/[^/]+\/branches\/[^/]+$/.test(path)) {
    json(response, 200, { name: path.split("/").pop() });
    return;
  }
  if (request.method === "GET" && /^\/repos\/[^/]+\/[^/]+\/contents\//.test(path)) {
    json(response, 200, { sha: "mockcontentsha" });
    return;
  }
  if (request.method === "PUT" && /^\/repos\/[^/]+\/[^/]+\/contents\//.test(path)) {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        JSON.parse(body);
      } catch {
        json(response, 400, { message: "Invalid JSON" });
        return;
      }
      const contentPath = decodeURIComponent(path.split("/contents/")[1] || "products/image.png");
      json(response, 201, {
        content: { path: contentPath },
        commit: { sha: "mockcommit123" },
      });
    });
    return;
  }
  json(response, 404, { message: "Not found" });
});

server.listen(port, host, () => {
  console.log(`[e2e-github] listening on http://${host}:${port}`);
});

const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
