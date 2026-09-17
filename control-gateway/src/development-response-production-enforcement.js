import fs from 'node:fs';
import path from 'node:path';

const RAW_IMPLEMENTATIONS = new Set([
  'control-gateway/src/github-mutation-admission.js',
  'control-gateway/src/github-production-mutation.js',
  'control-gateway/src/a01-supervisor-handoff.js',
  'control-gateway/src/governed-execution-admission.js'
]);

const FORBIDDEN = [
  /\bnew\s+GitHubMutationAdmissionGate\s*\(/,
  /\bnew\s+GitHubProductionMutationGate\s*\(/,
  /\bnew\s+GitHubReceiptConsumingCasWriter\s*\(/,
  /\badmitA01Execution\s*\(/,
  /\bbuildA01SupervisorHandoff\s*\(/
];
const ENTRYPOINT_REQUIRED = Object.freeze({
  '.github/scripts/control-gateway-production-writer.js': Object.freeze([
    'new GovernedGitHubMutationAdmissionGate(',
    'governedAdmissionGate.admit(request, { responseText, responseReceipt })'
  ]),
  '.github/scripts/control-gateway-authority-bootstrap.js': Object.freeze([
    'assertDevelopmentResponseAuthorization({',
    'CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64',
    'CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON'
  ])
});

const ENTRYPOINT_FORBIDDEN = Object.freeze([
  /\bnew\s+GitHubMutationAdmissionGate\s*\(/,
  /\badmitA01Execution\s*\(/,
  /\bbuildA01SupervisorHandoff\s*\(/
]);
function walk(root, relative = '') {
  const dir = path.join(root, relative);
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'test', 'tests', '__tests__'].includes(entry.name)) continue;
      out.push(...walk(root, rel));
    } else if (/\.(?:js|mjs|cjs|ts)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

export function auditDevelopmentResponseProductionEnforcement(repositoryRoot) {
  const violations = [];
  const sourceRoot = path.join(repositoryRoot, 'control-gateway', 'src');
  for (const sourceRelative of walk(sourceRoot)) {
    const rel = path.posix.join('control-gateway/src', sourceRelative);
    if (RAW_IMPLEMENTATIONS.has(rel)) continue;
    const text = fs.readFileSync(path.join(sourceRoot, sourceRelative), 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) violations.push({ path: rel, pattern: String(pattern) });
    }
  }
    for (const [entrypoint, requiredMarkers] of Object.entries(ENTRYPOINT_REQUIRED)) {
    const entrypointPath = path.join(repositoryRoot, ...entrypoint.split('/'));
    const text = fs.readFileSync(entrypointPath, 'utf8');

    for (const marker of requiredMarkers) {
      if (!text.includes(marker)) {
        violations.push({ path: entrypoint, missing: marker });
      }
    }

    for (const pattern of ENTRYPOINT_FORBIDDEN) {
      if (pattern.test(text)) {
        violations.push({ path: entrypoint, pattern: String(pattern) });
      }
    }
  }
  return violations;
}
