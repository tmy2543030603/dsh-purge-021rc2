#!/usr/bin/env node
/**
 * dsh-purge local installer.
 *
 * Installs the prebuilt tarball in this directory into the DSH web profile,
 * verifying its SHA-256 first and backing up any previous copy.
 *
 * Usage:
 *   node scripts/setup-local.mjs                 # auto-detect tarball in repo root
 *   node scripts/setup-local.mjs --dry-run       # print the plan only
 *   DSH_HOME=/custom/.dsh node scripts/setup-local.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const tarballName = `dsh-purge-${version}.tgz`;

const dryRun = process.argv.includes("--dry-run");
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const dest = path.join(dshHome, "profiles", "web", "node_modules");
const target = path.join(dest, "dsh-purge");
const tarball = path.join(root, tarballName);
const sumsFile = path.join(root, "SHA256SUMS.txt");

const say = (m) => console.log(m);
const die = (m) => { console.error(`\u2717 ${m}`); process.exit(1); };

if (!fs.existsSync(tarball)) die(`missing ${tarballName} (run: npm pack)`);
if (!fs.existsSync(dest)) die(`profile directory not found: ${dest} (start dsh web once first)`);

// 1. integrity
if (fs.existsSync(sumsFile)) {
  const expected = fs.readFileSync(sumsFile, "utf8").trim().split(/\s+/)[0].toLowerCase();
  const actual = crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex");
  if (expected !== actual) die(`SHA-256 mismatch: expected ${expected}, got ${actual}`);
  say(`\u2713 sha256 ok (${actual.slice(0, 16)}\u2026)`);
} else {
  say("\u26a0 SHA256SUMS.txt not found, skipping checksum");
}

// 2. backup
let backup = null;
if (fs.existsSync(target)) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  backup = `${target}.${stamp}.bak`;
  say(`\u2192 backup existing install \u2192 ${backup}`);
  if (!dryRun) fs.renameSync(target, backup);
}

// 3. unpack
say(`\u2192 unpack ${tarballName} \u2192 ${target}`);
if (!dryRun) {
  fs.mkdirSync(target, { recursive: true });
  execFileSync("tar", ["xzf", tarball, "-C", target, "--strip-components=1"], { stdio: "inherit" });
}

// 4. version stamps (keeps the host from re-patching on every start)
if (!dryRun) {
  const stampDir = path.join(dshHome, "dsh-purge");
  fs.mkdirSync(stampDir, { recursive: true });
  const sha = `apply:${version}`;
  fs.writeFileSync(path.join(stampDir, "installed-rev"), `${sha}\n`);
  fs.writeFileSync(
    path.join(stampDir, "applied.json"),
    JSON.stringify({ version, sha, at: new Date().toISOString() }, null, 2) + "\n",
  );
  say(`\u2713 stamps written \u2192 ${stampDir}`);
}

// 5. load check
if (!dryRun) {
  const entry = path.join(target, "lib", "index.js");
  if (!fs.existsSync(entry)) die(`unpack failed: ${entry} missing`);
  say(`\u2713 installed dsh-purge ${version} \u2192 ${target}`);
  say("  fully quit and reopen DSH, then open the Purge panel and press Apply");
} else {
  say("[dry-run] no changes written");
}
if (backup) say(`  rollback: rm -rf "${target}" && mv "${backup}" "${target}"`);
