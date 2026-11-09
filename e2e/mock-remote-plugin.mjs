#!/usr/bin/env node
/**
 * Minimal remote plugin used by Playwright. It is HTTP-only on purpose and
 * only works when CloudCart is started with the E2E insecure-origin flag.
 */
import crypto from "node:crypto";
import http from "node:http";

const port = Number(process.env.E2E_PLUGIN_PORT || 8788);
const secret = process.env.E2E_PLUGIN_SECRET || "e2e-remote-plugin-secret-123456";
const serviceBase = `http://127.0.0.1:${port}/api`;
const adminEntry = `http://127.0.0.1:${port}/admin`;

const manifest = {
  id: "e2e-remote-plugin",
  name: "E2E Remote Plugin",
  version: "1.0.0",
  apiVersion: "1",
  type: "analytics",
  runtime: "remote",
  description: "Remote plugin used by the CloudCart browser test suite.",
  author: "CloudCart Tests",
  capabilities: ["analytics.read"],
  permissions: ["store:read", "products:read"],
  service: { baseUrl: serviceBase, auth: "hmac-sha256" },
  admin: {
    entryUrl: adminEntry,
    pages: [{ id: "dashboard", label: "Plugin Dashboard", icon: "chart" }],
  },
};

const adminHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>E2E Remote Plugin</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 28px; color: #17202a; background: #f7f8fa; }
    .card { max-width: 620px; margin: 0 auto; background: #fff; border: 1px solid #e3e6ea; border-radius: 10px; padding: 24px; }
    h1 { margin-top: 0; font-size: 1.3rem; }
    code { background: #f1f3f5; padding: 2px 5px; border-radius: 4px; }
    .ok { color: #1a7f37; font-weight: 600; }
    .error { color: #b42318; font-weight: 600; }
  </style>
</head>
<body>
  <main class="card">
    <h1>E2E Remote Plugin</h1>
    <p>Page: <code data-plugin-page></code></p>
    <p>Token: <span data-plugin-token-status>waiting</span></p>
    <p>Store: <strong data-plugin-store-name>—</strong></p>
    <p>Store id: <code data-plugin-store-id>—</code></p>
    <p data-plugin-error></p>
  </main>
  <script>
    (function () {
      const pageId = new URLSearchParams(location.search).get("page") || "";
      document.querySelector("[data-plugin-page]").textContent = pageId;
      const parentOrigin = (() => {
        try { return new URL(document.referrer).origin; } catch { return ""; }
      })();
      let token = "";
      window.addEventListener("message", async (event) => {
        if (!parentOrigin || event.origin !== parentOrigin) return;
        const data = event.data || {};
        if (data.type === "cloudcart:token" && typeof data.token === "string") {
          token = data.token;
          document.querySelector("[data-plugin-token-status]").textContent = "received";
          try {
            const response = await fetch(parentOrigin + "/api/plugin/v1/store", {
              headers: { Authorization: "Bearer " + token },
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error?.message || "Store API failed");
            document.querySelector("[data-plugin-store-name]").textContent = body.data.name;
            document.querySelector("[data-plugin-store-id]").textContent = body.data.id;
            document.querySelector("[data-plugin-token-status]").className = "ok";
          } catch (error) {
            document.querySelector("[data-plugin-error]").textContent = String(error);
            document.querySelector("[data-plugin-error]").className = "error";
          }
        }
      });
      if (parentOrigin) {
        window.parent.postMessage({ type: "cloudcart:ready", pageId }, parentOrigin);
      } else {
        document.querySelector("[data-plugin-error]").textContent = "No parent origin";
      }
    })();
  </script>
</body>
</html>`;

function verifySignature(req, body) {
  const timestamp = req.headers["x-cloudcart-timestamp"];
  const nonce = req.headers["x-cloudcart-nonce"];
  const signature = req.headers["x-cloudcart-signature"];
  if (!timestamp || !nonce || !signature) return false;
  const path = req.url || "/";
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = `${timestamp}\n${nonce}\n${req.method}\n${path}\n${bodyHash}`;
  const expected = crypto.createHmac("sha256", secret).update(canonical).digest("base64url");
  return expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && (url.pathname === "/cloudcart-plugin.json" || url.pathname === "/manifest.json")) {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(manifest));
    return;
  }
  if (req.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src http://127.0.0.1:*; frame-ancestors http://127.0.0.1:*",
    });
    res.end(adminHtml);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (!verifySignature(req, body)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "Invalid signature" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: "1.0.0" }));
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, message: "Not found" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[e2e-plugin] listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
