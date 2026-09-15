#!/usr/bin/env node
// Wraps `npm audit --json` with a documented-exceptions allowlist, the same
// idea as the repo's .trivyignore for the Docker image scan — `npm audit`
// itself has no such mechanism. Any high/critical advisory not listed in
// the ignore file still fails the build.
//
// Usage: node check-npm-audit.js <audit.json> <ignore-file>

const fs = require('fs');

const [, , auditJsonPath, ignoreFilePath] = process.argv;
if (!auditJsonPath || !ignoreFilePath) {
  console.error('Usage: node check-npm-audit.js <audit.json> <ignore-file>');
  process.exit(2);
}

const ignored = new Set(
  fs
    .readFileSync(ignoreFilePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')),
);

const data = JSON.parse(fs.readFileSync(auditJsonPath, 'utf8'));
const vulnerabilities = data.vulnerabilities || {};

const found = new Map(); // advisory id -> { severity, title, url }
for (const vuln of Object.values(vulnerabilities)) {
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;
  for (const via of vuln.via || []) {
    if (via && typeof via === 'object' && via.source) {
      found.set(String(via.source), { severity: via.severity, title: via.title, url: via.url });
    }
  }
}

const unapproved = [...found.entries()].filter(([id]) => !ignored.has(id));

if (found.size === 0) {
  console.log('npm audit: no high/critical vulnerabilities.');
  process.exit(0);
}

console.log(`npm audit: ${found.size} high/critical advisory id(s) found, ${found.size - unapproved.length} documented in ${ignoreFilePath}.`);

if (unapproved.length > 0) {
  console.error('\nUndocumented high/critical advisories — add to the ignore file with a justification, or fix them:');
  for (const [id, info] of unapproved) {
    console.error(`  - npm advisory ${id} (${info.severity}): ${info.title}\n    ${info.url}`);
  }
  process.exit(1);
}

console.log('All high/critical advisories are documented exceptions.');
process.exit(0);
