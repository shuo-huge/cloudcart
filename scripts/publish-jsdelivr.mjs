#!/usr/bin/env node
/**
 * Publishes local images to a public GitHub repository and prints the
 * corresponding jsDelivr URLs. jsDelivr is a CDN, not an upload service, so
 * this script performs the required git commit/tag/push step.
 *
 * Usage:
 *   node scripts/publish-jsdelivr.mjs --repo ../cloudcart-media --dest products \
 *     --tag v1 ./photo-1.jpg ./photo-2.jpg
 *
 * The target repository must already exist, have an `origin` GitHub remote,
 * and be authenticated through the user's normal git credential helper.
 * jsDelivr is intended for open-source projects; review its terms before
 * using it for a commercial product catalog.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function runGit(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (allowFailure) return null;
    const stderr = error.stderr?.toString().trim();
    fail(stderr || error.message);
  }
}

function slugifyFile(name) {
  const extension = path.extname(name).toLowerCase() || ".jpg";
  const base = path.basename(name, path.extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
  return `${base}${extension}`;
}

const args = process.argv.slice(2);
const flags = {};
const files = [];
for (let index = 0; index < args.length; index += 1) {
  const token = args[index];
  if (!token.startsWith("--")) {
    files.push(token);
    continue;
  }
  const name = token.slice(2);
  const next = args[index + 1];
  if (["dry-run", "no-push", "json"].includes(name)) {
    flags[name] = true;
  } else if (next !== undefined && !next.startsWith("--")) {
    flags[name] = next;
    index += 1;
  } else {
    fail(`--${name} needs a value.`);
  }
}

if (!flags.repo) fail("--repo <local-git-repo> is required.");
if (files.length === 0) fail("Pass one or more image files.");

const repo = path.resolve(flags.repo);
if (!fs.existsSync(path.join(repo, ".git"))) fail(`Not a git repository: ${repo}`);
const remote = runGit(repo, ["remote", "get-url", "origin"], { allowFailure: true });
if (!remote) fail("The target repository has no `origin` remote.");
const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
if (!match) fail("The origin remote is not a GitHub repository.");
const [, owner, repoName] = match;
const destination = String(flags.dest || "media").replace(/^\/+|\/+$/g, "");
if (!destination || destination.includes("..") || path.isAbsolute(destination)) {
  fail("--dest must be a relative path inside the repository.");
}
const destinationDir = path.join(repo, destination);
fs.mkdirSync(destinationDir, { recursive: true });

const published = [];
for (const file of files) {
  const source = path.resolve(file);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) fail(`Missing image: ${file}`);
  const targetName = slugifyFile(path.basename(source));
  const target = path.join(destinationDir, targetName);
  published.push({ source, target, targetName });
  if (flags["dry-run"]) continue;
  fs.copyFileSync(source, target);
  console.log(`copied ${file} -> ${path.relative(repo, target)}`);
}

if (flags["dry-run"]) {
  const result = published.map((entry) => ({
    source: entry.source,
    path: `${destination}/${entry.targetName}`,
    url: `https://cdn.jsdelivr.net/gh/${owner}/${repoName}@<commit>/${destination}/${entry.targetName}`,
  }));
  console.log(JSON.stringify({ ok: true, dryRun: true, repo: `${owner}/${repoName}`, files: result }, null, 2));
  process.exit(0);
}

runGit(repo, ["add", "--", destination]);
const staged = runGit(repo, ["diff", "--cached", "--name-only"], { allowFailure: true }) || "";
if (staged) {
  runGit(repo, ["commit", "-m", String(flags.message || "Add product media")]);
} else {
  console.log("No new image changes to commit; using the current commit.");
}
if (flags.tag) {
  if (runGit(repo, ["rev-parse", "--verify", `refs/tags/${flags.tag}`], { allowFailure: true })) {
    fail(`Tag already exists: ${flags.tag}`);
  }
  runGit(repo, ["tag", flags.tag]);
}
if (!flags["no-push"]) {
  runGit(repo, ["push", "origin", "HEAD"]);
  if (flags.tag) runGit(repo, ["push", "origin", flags.tag]);
}
const ref = String(flags.tag || runGit(repo, ["rev-parse", "HEAD"]));
const result = published.map((entry) => ({
  source: entry.source,
  path: `${destination}/${entry.targetName}`,
  url: `https://cdn.jsdelivr.net/gh/${owner}/${repoName}@${ref}/${destination}/${entry.targetName}`,
}));

if (flags.json) {
  console.log(JSON.stringify({ ok: true, repo: `${owner}/${repoName}`, ref, files: result }, null, 2));
} else {
  for (const entry of result) console.log(entry.url);
}
