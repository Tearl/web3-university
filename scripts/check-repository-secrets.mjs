import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenTracked = [".env", ".env.local", "packages/cre-workflow/.env", "packages/cre-workflow/secrets.yaml"];
const findings = forbiddenTracked.filter((path) => tracked.includes(path)).map((path) => ({ file: path, rule: "private-config-tracked" }));

const rules = [
  { name: "private-key-pem", pattern: /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/ },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "public-rpc-api-key", pattern: /https:\/\/(?:eth-[a-z0-9-]+\.)?(?:g\.alchemy\.com|infura\.io)\/v[23]\/[A-Za-z0-9_-]{16,}/i },
  { name: "deployment-private-key", pattern: /^(?:DEPLOYER|TEACHER|TREASURY|FALLBACK_ORACLE)_PRIVATE_KEY\s*=\s*0x[a-fA-F0-9]{64}\s*$/m },
];

for (const file of candidates) {
  let stat;
  try { stat = statSync(file); } catch { continue; }
  if (!stat.isFile() || stat.size > 2_000_000) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const rule of rules) {
    if (rule.pattern.test(text)) findings.push({ file, rule: rule.name });
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^PRIVY_APP_SECRET\s*=\s*([^#]*)/);
    if (!match) continue;
    const value = match[1].trim();
    if (value && !/^(?:replace-|change-me|your-)/i.test(value)) {
      findings.push({ file, rule: "privy-app-secret" });
    }
  }
}

if (findings.length > 0) {
  console.error("Repository secret check failed:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.rule}`);
  process.exit(1);
}

console.log(JSON.stringify({ status: "ready", candidateFilesScanned: candidates.length, findings: 0 }, null, 2));
