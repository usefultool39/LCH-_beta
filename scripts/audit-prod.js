#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const ALLOWED_ADVISORY_URLS = new Set([
  'https://github.com/advisories/GHSA-5v7r-6r5c-r473'
]);

function collectAdvisoryUrls(name, vulnerabilities, seen = new Set()) {
  if (!name || seen.has(name)) return [];
  seen.add(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return [];
  const urls = [];
  for (const via of vulnerability.via || []) {
    if (typeof via === 'string') {
      urls.push(...collectAdvisoryUrls(via, vulnerabilities, seen));
    } else if (via && typeof via === 'object' && via.url) {
      urls.push(String(via.url));
    }
  }
  return urls;
}

function main() {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : 'npm';
  const args = npmCli ? [npmCli, 'audit', '--omit=dev', '--json'] : ['audit', '--omit=dev', '--json'];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
  const stdout = result.stdout || '';
  if (!stdout.trim()) {
    process.stderr.write(result.stderr || 'npm audit did not return JSON output\n');
    process.exit(result.status || 1);
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    process.stdout.write(stdout);
    process.stderr.write(result.stderr || '');
    process.stderr.write(`Failed to parse npm audit JSON: ${error.message}\n`);
    process.exit(result.status || 1);
  }

  const vulnerabilities = report.vulnerabilities || {};
  const disallowed = Object.keys(vulnerabilities).filter((name) => {
    const urls = collectAdvisoryUrls(name, vulnerabilities);
    return !urls.length || urls.some((url) => !ALLOWED_ADVISORY_URLS.has(url));
  });

  if (disallowed.length) {
    process.stdout.write(stdout);
    process.stderr.write(result.stderr || '');
    process.stderr.write(`Production audit found unallowed vulnerabilities: ${disallowed.join(', ')}\n`);
    process.exit(result.status || 1);
  }

  const allowedCount = Object.keys(vulnerabilities).length;
  if (allowedCount) {
    process.stdout.write(`Production audit passed with ${allowedCount} allowed upstream no-fix finding(s): ${[...ALLOWED_ADVISORY_URLS].join(', ')}\n`);
    return;
  }

  process.stdout.write('Production audit passed: no production vulnerabilities found.\n');
}

main();
