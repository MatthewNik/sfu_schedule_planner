import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set(["node_modules", "dist", "coverage", ".git", ".vite"]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".html"]);
const secretEnvPattern = /VITE_[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL)[A-Z0-9_]*/;
const forbiddenPatterns = [
  {
    pattern: /dangerouslySetInnerHTML/,
    message: "Do not render user/SFU text with dangerouslySetInnerHTML."
  },
  {
    pattern: secretEnvPattern,
    message: "VITE_* variables are public; secret-like VITE_* names are forbidden."
  }
];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return ignoredDirectories.has(entry) ? [] : walk(path);
    }
    return [path];
  });
}

function extension(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

const failures = [];
const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
for (const required of [".env", ".env.local", ".env.*.local"]) {
  if (!gitignore.includes(required)) {
    failures.push(`.gitignore must include ${required}`);
  }
}

for (const file of walk(root)) {
  if (file.endsWith("scripts/security-check.mjs")) {
    continue;
  }

  if (!sourceExtensions.has(extension(file))) {
    continue;
  }

  const text = readFileSync(file, "utf8");
  for (const check of forbiddenPatterns) {
    if (check.pattern.test(text)) {
      failures.push(`${file}: ${check.message}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Security checks passed.");
