import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", "node_modules"]);
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
const fileSet = new Set(files.map((file) => resolve(file)));

for (const file of files.filter((candidate) => extname(candidate) === ".js")) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) errors.push(`${file.slice(root.length + 1)}: ${result.stderr.trim()}`);
}

for (const file of files.filter((candidate) => extname(candidate) === ".html")) {
  const html = await readFile(file, "utf8");
  const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const reference of references) {
    if (reference.includes("${")) continue;
    if (/^(?:https?:|data:|tel:|mailto:|#|javascript:)/i.test(reference)) continue;
    const clean = reference.split(/[?#]/)[0];
    if (!clean) continue;
    const target = resolve(dirname(file), clean);
    if (!fileSet.has(target)) errors.push(`${file.slice(root.length + 1)} references missing ${reference}`);
  }

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) errors.push(`${file.slice(root.length + 1)} has duplicate ids: ${[...new Set(duplicates)].join(", ")}`);

  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  inlineScripts.forEach((match, index) => {
    try {
      new vm.Script(match[1], { filename: `${file}#inline-${index + 1}` });
    } catch (error) {
      errors.push(`${file.slice(root.length + 1)} inline script ${index + 1}: ${error.message}`);
    }
  });
}

for (const locale of ["en", "hi", "ur"]) {
  const path = join(root, "locales", `${locale}.json`);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed["nav.home"] || !parsed["nav.settings"]) errors.push(`locales/${locale}.json is missing required navigation labels`);
  } catch (error) {
    errors.push(`locales/${locale}.json: ${error.message}`);
  }
}

const manifest = JSON.parse(await readFile(join(root, "manifest.webmanifest"), "utf8"));
for (const icon of manifest.icons || []) {
  const target = resolve(root, icon.src);
  if (!fileSet.has(target)) errors.push(`manifest icon is missing: ${icon.src}`);
}

if (errors.length) {
  console.error(`Static checks failed (${errors.length}):\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exit(1);
}

console.log(`Static checks passed for ${files.length} files.`);
