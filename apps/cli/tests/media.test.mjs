import { describe, expect, it } from "vitest";
import { ApiClient } from "../src/client.mjs";
import { downloadImage } from "../src/commands/content.mjs";

const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7xkAAAAASUVORK5CYII=",
  "base64",
));

function imageResponse() {
  return new Response(PNG, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(PNG.length) },
  });
}

describe("CLI media import", () => {
  it("downloads a public HTTPS image and derives a safe filename", async () => {
    const image = await downloadImage("https://cdn.example.com/products/Photo%201.png", {
      fetchImpl: async () => imageResponse(),
    });
    expect(image.contentType).toBe("image/png");
    expect(image.filename).toBe("Photo-1.png");
    expect(image.bytes.length).toBe(PNG.length);
  });

  it("rejects private hosts, non-images, and oversized files", async () => {
    await expect(downloadImage("http://127.0.0.1/image.png", { fetchImpl: async () => imageResponse() })).rejects.toThrow(/public HTTPS/);
    await expect(downloadImage("https://cdn.example.com/file.txt", {
      fetchImpl: async () => new Response("hello", { headers: { "content-type": "text/plain" } }),
    })).rejects.toThrow(/JPEG/);
    await expect(downloadImage("https://cdn.example.com/large.png", {
      fetchImpl: async () => new Response(PNG, {
        headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) },
      }),
    })).rejects.toThrow(/5 MB/);
  });

  it("follows safe redirects and rejects redirects to private hosts", async () => {
    const image = await downloadImage("https://cdn.example.com/a.png", {
      fetchImpl: async (url) => {
        if (String(url) === "https://cdn.example.com/a.png") {
          return new Response(null, { status: 302, headers: { location: "/b.png" } });
        }
        return imageResponse();
      },
    });
    expect(image.filename).toBe("b.png");

    await expect(downloadImage("https://cdn.example.com/a.png", {
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/a.png" } }),
    })).rejects.toThrow(/public HTTPS/);
  });

  it("adds the selected storage to multipart uploads", async () => {
    let uploaded;
    const client = new ApiClient({
      baseUrl: "https://store.example.com",
      apiKey: "cck_test",
      fetchImpl: async (_url, init) => {
        uploaded = init.body;
        return new Response(JSON.stringify({ ok: true, data: { id: "med_1" } }), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    await client.uploadFile("/api/admin/media", {
      bytes: PNG,
      filename: "test.png",
      contentType: "image/png",
      alt: "test",
      storage: "jsdelivr",
    });
    expect(uploaded).toBeInstanceOf(FormData);
    expect(uploaded.get("storage")).toBe("jsdelivr");
    expect(uploaded.get("alt")).toBe("test");
    expect(uploaded.get("file")).toBeInstanceOf(Blob);
  });
});
