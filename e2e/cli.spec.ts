import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const BASE = "http://127.0.0.1:8787";
const CLI = path.resolve("apps/cli/bin/cloudcart.mjs");

async function cli(configPath: string, args: string[]) {
  try {
    const result = await run(process.execPath, [CLI, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, CLOUDCART_CONFIG: configPath },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: unknown; stderr?: unknown };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? ""),
    };
  }
}

test.describe("CloudCart CLI", () => {
  test("logs in, creates a product and blog page, then logs out", async ({ request }) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cloudcart-e2e-cli-"));
    const config = path.join(directory, "config.json");
    const postFile = path.join(directory, "post.html");
    const imageFile = path.join(directory, "image.png");
    fs.writeFileSync(postFile, "<h2>CLI post</h2><p>Created by the browser end-to-end test.</p>");
    fs.writeFileSync(imageFile, Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7xkAAAAASUVORK5CYII=",
      "base64",
    ));

    const login = await cli(config, [
      "auth", "login",
      "--url", BASE,
      "--email", "e2e-owner@example.com",
      "--password", "E2ePassword123!",
      "--json",
    ]);
    expect(login.code, login.stderr + login.stdout).toBe(0);
    expect(JSON.parse(login.stdout).data.admin.email).toBe("e2e-owner@example.com");

    const product = await cli(config, [
      "products", "create",
      "--name", "CLI E2E Product",
      "--slug", "cli-e2e-product",
      "--price", "42.00",
      "--status", "active",
      "--json",
    ]);
    expect(product.code, product.stderr + product.stdout).toBe(0);
    const productData = JSON.parse(product.stdout).data;

    const image = await cli(config, [
      "products", "images", "attach", productData.id,
      "--file", imageFile,
      "--storage", "jsdelivr",
      "--alt", "CLI E2E image",
      "--json",
    ]);
    expect(image.code, image.stderr + image.stdout).toBe(0);

    const blog = await cli(config, [
      "blog", "create",
      "--title", "CLI E2E Post",
      "--slug", "cli-e2e-post",
      "--text-file", postFile,
      "--publish",
      "--json",
    ]);
    expect(blog.code, blog.stderr + blog.stdout).toBe(0);
    expect(JSON.parse(blog.stdout).data.published).toBe(true);

    const productPage = await request.get(`${BASE}/products/cli-e2e-product`);
    expect(productPage.status()).toBe(200);
    const postPage = await request.get(`${BASE}/pages/cli-e2e-post`);
    expect(postPage.status()).toBe(200);

    const orders = await cli(config, ["orders", "list", "--json"]);
    expect(orders.code, orders.stderr + orders.stdout).toBe(0);
    expect(JSON.parse(orders.stdout).data).toHaveProperty("items");

    const logout = await cli(config, ["auth", "logout", "--json"]);
    expect(logout.code, logout.stderr + logout.stdout).toBe(0);
  });
});
