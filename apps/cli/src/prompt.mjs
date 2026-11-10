import readline from "node:readline/promises";
import process from "node:process";
import { usageError } from "./errors.mjs";

export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export async function promptText(question) {
  if (!process.stdin.isTTY) throw usageError("This command needs an interactive terminal or explicit flags.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function promptHidden(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw usageError("A password is required. Use --password-stdin or CLOUDCART_PASSWORD in non-interactive mode.");
  }
  process.stdout.write(question);
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  try {
    return await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        const text = chunk.toString("utf8");
        for (const char of text) {
          if (char === "\r" || char === "\n") {
            cleanup();
            process.stdout.write("\n");
            resolve(value);
            return;
          }
          if (char === "\u0003") {
            cleanup();
            process.stdout.write("\n");
            reject(usageError("Login cancelled."));
            return;
          }
          if (char === "\u007f" || char === "\b") {
            value = value.slice(0, -1);
            continue;
          }
          value += char;
        }
      };
      const cleanup = () => {
        stdin.off("data", onData);
        stdin.setRawMode(Boolean(wasRaw));
        stdin.pause();
      };
      stdin.on("data", onData);
    });
  } catch (error) {
    throw error;
  }
}

export async function getEmail(flags, env = process.env) {
  return String(flags.email || env.CLOUDCART_EMAIL || (await promptText("Admin email: "))).trim();
}

export async function getPassword(flags, env = process.env) {
  if (typeof flags.password === "string") return flags.password;
  if (flags["password-stdin"]) return (await readStdin()).replace(/\r?\n$/, "");
  if (env.CLOUDCART_PASSWORD) return env.CLOUDCART_PASSWORD;
  return promptHidden("Admin password: ");
}

export async function getSetupToken(flags) {
  if (typeof flags["setup-token"] === "string") return flags["setup-token"];
  if (typeof flags["setup-token-file"] === "string") {
    const { readFile } = await import("node:fs/promises");
    return (await readFile(flags["setup-token-file"], "utf8")).trim();
  }
  return promptText("One-time setup token: ");
}
