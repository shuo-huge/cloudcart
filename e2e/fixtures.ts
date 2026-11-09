import fs from "node:fs";
import path from "node:path";

export interface Fixtures {
  productId: string;
  productSlug: string;
  imageUrls: string[];
  homeVersion: number;
}

export function loadFixtures(): Fixtures {
  return JSON.parse(fs.readFileSync(path.resolve("e2e/.auth/fixtures.json"), "utf8")) as Fixtures;
}
