import { describe, expect, it } from "vitest";
import { parseArgs, flagBool, flagList, flagString } from "../src/args.mjs";

describe("CLI argument parsing", () => {
  it("parses global flags before and after the command", () => {
    const { flags, positionals } = parseArgs(["--json", "products", "list", "--status", "active"]);
    expect(flags.json).toBe(true);
    expect(flags.status).toBe("active");
    expect(positionals).toEqual(["products", "list"]);
  });

  it("supports repeated and negated flags", () => {
    const { flags } = parseArgs(["--tag", "a", "--tag=b", "--no-featured", "--image", "https://x/1.jpg"]);
    expect(flagList(flags, "tag")).toEqual(["a", "b"]);
    expect(flagBool(flags, "featured", true)).toBe(false);
    expect(flagString(flags, "image")).toBe("https://x/1.jpg");
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--definitely-not-a-flag"])).toThrow(/Unknown flag/);
  });
});
