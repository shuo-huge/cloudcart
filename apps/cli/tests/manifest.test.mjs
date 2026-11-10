import { describe, expect, it } from "vitest";
import { COMMANDS, resolveCommand } from "../src/manifest.mjs";

describe("CLI manifest", () => {
  it("has unique command paths and runnable handlers", () => {
    const paths = COMMANDS.map((command) => command.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const command of COMMANDS) {
      expect(command.summary).toBeTruthy();
      expect(command.usage).toBeTruthy();
      expect(typeof command.run).toBe("function");
    }
  });

  it("resolves nested commands and preserves positional args", () => {
    const resolved = resolveCommand(["products", "images", "add", "prd_1", "med_1"]);
    expect(resolved.definition.path).toBe("products images add");
    expect(resolved.args).toEqual(["prd_1", "med_1"]);
  });

  it("resolves shipping, blog and media storage commands", () => {
    expect(resolveCommand(["shipping", "zones", "create"]).definition.path).toBe("shipping zones create");
    expect(resolveCommand(["blog", "create"]).definition.path).toBe("blog create");
    expect(resolveCommand(["media", "import-url", "https://x/y.jpg"]).definition.path).toBe("media import-url");
    expect(resolveCommand(["media", "storage"]).definition.path).toBe("media storage");
  });

  it("rejects unknown commands", () => {
    expect(() => resolveCommand(["does", "not", "exist"])).toThrow(/Unknown command/);
  });
});
