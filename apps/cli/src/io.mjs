import fs from "node:fs/promises";
import { usageError } from "./errors.mjs";
import { readStdin } from "./prompt.mjs";

export async function readJsonInput(value, label = "JSON") {
  if (value === undefined || value === true) throw usageError(`Missing ${label}. Use --data '{...}', --data @file, or --data -.`);
  const text = value === "-"
    ? await readStdin()
    : String(value).startsWith("@")
      ? await fs.readFile(String(value).slice(1), "utf8")
      : String(value);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw usageError(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function readTextInput(value, fileValue, label = "text") {
  if (typeof fileValue === "string") {
    if (fileValue === "-") return readStdin();
    return fs.readFile(fileValue, "utf8");
  }
  if (typeof value === "string") {
    if (value === "-") return readStdin();
    return value;
  }
  throw usageError(`Missing ${label}. Use --${label === "text" ? "text" : label} or a file flag.`);
}

export async function readFileBytes(filePath) {
  if (!filePath || filePath === true) throw usageError("Missing file path.");
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("not a file");
    return await fs.readFile(filePath);
  } catch (error) {
    throw usageError(`Cannot read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function splitList(value) {
  if (value === undefined || value === null || value === true) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => String(entry).split(",")).map((entry) => entry.trim()).filter(Boolean);
}

export function integerFlag(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = undefined } = {}) {
  if (value === undefined || value === null || value === true) {
    if (fallback !== undefined) return fallback;
    throw usageError(`Missing --${label}.`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw usageError(`Invalid --${label}: ${value}.`);
  }
  return parsed;
}

export function queryPairs(values) {
  const query = {};
  for (const entry of values || []) {
    const index = String(entry).indexOf("=");
    if (index === -1) throw usageError(`Invalid --query "${entry}". Use key=value.`);
    query[String(entry).slice(0, index)] = String(entry).slice(index + 1);
  }
  return query;
}

export function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    );
  }
  return value;
}
