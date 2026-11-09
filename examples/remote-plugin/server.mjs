#!/usr/bin/env node
/**
 * Minimal remote plugin server.
 *
 * Production: run behind HTTPS on a public host.
 * Local: PUBLIC_ORIGIN=http://localhost:8790 node server.mjs
 */
import crypto from "node:crypto";
import http from "node:http";

const port = Number(process.env.PORT || 8790);
const publicOrigin = (process.env.PUBLIC_ORIGIN || `http://localhost:${port}`).replace(/\/+$/, "");
const serviceSecret = process.env.CLOUDCART_SERVICE_SECRET || "replace-with-the-service-secret";
const storeOrigin = process.env.CLOUDCART_ADMIN_ORIGIN || "http://localhost:8787";

const manifest = {
  id: "example-analytics",
  name: "Example Analytics",
  version: "1.0.0",
  apiVersion: "1",
  type: "analytics",
  runtime: "remote",
  description: "Minimal remote plugin example with an iframe admin page and HMAC-signed health endpoint.",
  author: "Example Developer",
  capabilities: ["analytics.read"],
  permissions: ["store:read", "products:read"],
  service: { baseUrl: `${publicOrigin}/api/cloudcart/v1`, auth: "hmac-sha256" },
  admin: {
    entryUrl: `${publicOrigin}/admin`,
    pages: [{ id: "overview", label: "Analytics overview", icon: "chart" }],
  },
};

function verifyCloudCartSignature(req, body) {
  const timestamp = req.headers["x-cloudcart-timestamp"];
  const nonce = req.headers["x-cloudcart-nonce"];
  const signature = req.headers["x-cloudcart-signature"];
  if (!timestamp || !nonce || !signature) return false;
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = `${timestamp}\n${nonce}\n${req.method}\n${req.url}\n${bodyHash}`;
  const expected = crypto.createHmac("sha256", serviceSecret).update(canonical).digest("base64url");
  return expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const adminHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Example Analytics</title>
  <style>body{font-family:system-ui,sans-serif;padding:28px;background:#f7f8fa;color:#17202a}main{max-width:640px;margin:auto;background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:24px}</style>
</head>
<body>
<main>
  <h1>Example Analytics</h1>
  <p>Page: <code id="page"></code></p>
  <p>Store: <strong id="store">connecting…</strong></p>
  <p>Status: <span id="status">waiting for CloudCart</span></p>
</main>
<script>
  const pageId = new URLSearchParams(location.search).get("page") || "";
  const parentOrigin = (() => { try { return new URL(document.referrer).origin; } catch { return ""; } })();
  document.getElementById("page").textContent = pageId;
  let token = "";

  window.addEventListener("message", async (event) => {
    // Never accept a token from an unexpected origin.
    if (!parentOrigin || event.origin !== parentOrigin) return;
    const data = event.data || {};
    if (data.type === "cloudcart:token" && typeof data.token === "string") {
      token = data.token;
      const response = await fetch(parentOrigin + "/api/plugin/v1/store", {
        headers: { Authorization: "Bearer " + token },
      });
      const body = await response.json();
      document.getElementById("store").textContent = body?.data?.name || "unknown";
      document.getElementById("status").textContent = response.ok ? "connected" : "error";
    }
  });

  if (parentOrigin) {
    window.parent.postMessage({ type: "cloudcart:ready", pageId }, parentOrigin);
  } else {
    document.getElementById("status").textContent = "missing parent origin";
  }
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", publicOrigin);
  if (req.method === "GET" && url.pathname === "/cloudcart-plugin.json") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(manifest));
    return;
  }
  if (req.method === "GET" && url.pathname === "/admin") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // CloudCart refuses to frame a plugin that does not allow its admin origin.
      "Content-Security-Policy": `frame-ancestors ${storeOrigin}; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src ${storeOrigin}`,
    });
    res.end(adminHtml);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/cloudcart/v1/health") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (!verifyCloudCartSignature(req, body)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "invalid signature" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: manifest.version }));
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, message: "not found" }));
});

server.listen(port, () => {
  console.log(`Example plugin on ${publicOrigin}`);
  console.log(`Manifest: ${publicOrigin}/cloudcart-plugin.json`);
});
