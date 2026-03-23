import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const includeExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);
const ignoreDirs = new Set(['.next', 'node_modules', '.git', '.vercel']);
const ignoreFiles = new Set(['scripts/check-encoding.mjs']);

const suspiciousPatterns = [
  /\uFFFD/g,
  /[\u951F\u95B3\u9225\u93C4\u9428\u9358\u93C6\u93AA]/g,
  /[\u00C3\u00C2]./g,
];

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!ignoreDirs.has(name)) {
        out.push(...walk(full));
      }
      continue;
    }
    if (!includeExt.has(path.extname(name))) {
      continue;
    }
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (ignoreFiles.has(rel)) {
      continue;
    }
    out.push(full);
  }
  return out;
}

const files = walk(root);
const issues = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of suspiciousPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      issues.push({
        file: path.relative(root, file),
        pattern: String(pattern),
        count: matches.length,
      });
    }
  }
}

if (issues.length > 0) {
  console.error('Encoding check failed. Suspicious mojibake patterns found:');
  for (const item of issues) {
    console.error(`- ${item.file} | ${item.pattern} | count=${item.count}`);
  }
  process.exit(1);
}

console.log(`Encoding check passed. ${files.length} files scanned.`);
