'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const evidence = path.resolve(process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || root, 'literary-overnight-sweep-evidence'));
fs.mkdirSync(evidence, { recursive: true });
const configPath = path.join(root, 'qualification', 'literary-prose-engine-001', 'overnight-research', 'LITERARY-OVERNIGHT-SWEEP-v1.json');
const baseSeedPath = path.join(root, 'qualification', 'literary-prose-engine-001', 'overnight-research', 'LITERARY-RESEARCH-DEEP-SEEDS-v1.json');
const harvesterPath = path.join(root, 'qualification', 'literary-prose-engine-001', 'overnight-research', 'deep_harvest.py');
for (const p of [configPath, baseSeedPath, harvesterPath]) if (!fs.existsSync(p)) throw new Error(`LITERARY_OVERNIGHT_REQUIRED_FILE_MISSING:${p}`);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const baseSeed = JSON.parse(fs.readFileSync(baseSeedPath, 'utf8'));
if (!Number.isInteger(config.shard_count) || config.shard_count < 2 || config.shard_count > 12) throw new Error('INVALID_SHARD_COUNT');
if (!Number.isInteger(config.shard_budget_seconds) || config.shard_budget_seconds < 300 || config.shard_budget_seconds > 1320) throw new Error('INVALID_SHARD_BUDGET');
if (!Array.isArray(config.extra_topics) || !Array.isArray(baseSeed.topics) || !Array.isArray(baseSeed.lenses)) throw new Error('INVALID_RESEARCH_CONFIG');
function probe(cmd, args) { const r = cp.spawnSync(cmd, args, { encoding: 'utf8', shell: false }); return !r.error && r.status === 0; }
let py = null, prefix = [];
if (probe('python', ['--version'])) py = 'python';
else if (probe('py', ['-3', '--version'])) { py = 'py'; prefix = ['-3']; }
if (!py) throw new Error('PYTHON_NOT_FOUND_ON_A01');
function writeJson(name, obj) { fs.writeFileSync(path.join(evidence, name), JSON.stringify(obj, null, 2) + '\n'); }
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/^run_.*fixtures\.py$/i.test(ent.name)) out.push(p);
  }
  return out;
}
const regressionRunners = [...new Set((config.regression_roots || []).flatMap(rel => walk(path.join(root, rel))))].sort();
function runRegressions(label) {
  const results = [];
  for (const runner of regressionRunners) {
    const r = cp.spawnSync(py, [...prefix, path.basename(runner)], { cwd: path.dirname(runner), encoding: 'utf8', shell: false, env: { ...process.env, PYTHONUNBUFFERED: '1' }, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    results.push({ runner: path.relative(root, runner).replace(/\\/g, '/'), status: r.status, signal: r.signal || null, stdout_tail: (r.stdout || '').slice(-2000), stderr_tail: (r.stderr || '').slice(-2000) });
    if (r.error || r.status !== 0) { writeJson(`regressions-${label}.json`, { standing: 'FAIL', results }); throw new Error(`LITERARY_REGRESSION_FAILED:${path.relative(root, runner)}`); }
  }
  writeJson(`regressions-${label}.json`, { standing: 'PASS', count: results.length, results });
  return results.length;
}
const prequal = process.env.A01_PREQUALIFY_ONLY === '1';
const topics = [...new Set([...(baseSeed.topics || []), ...(config.extra_topics || [])])];
const shards = Array.from({ length: config.shard_count }, () => []);
topics.forEach((topic, i) => shards[i % shards.length].push(topic));
const plan = {
  qualification_id: 'LITERARY-PROSE-OVERNIGHT-RESEARCH-REGRESSION-SWEEP',
  subject_sha: process.env.GITHUB_SHA || null,
  prequal,
  active_date_new_york: config.active_date_new_york,
  shard_count: shards.length,
  shard_budget_seconds: config.shard_budget_seconds,
  total_research_budget_seconds: shards.length * config.shard_budget_seconds,
  topic_count: topics.length,
  queries_per_topic: 1 + baseSeed.lenses.length,
  pages_per_query: config.pages_per_query,
  per_page: config.per_page,
  regression_runner_count: regressionRunners.length,
  full_text_acquisition: false,
  raw_user_manuscript_persistence: false,
  named_author_imitation_target: false
};
writeJson('wrapper-plan.json', plan);
if (prequal) {
  const c = cp.spawnSync(py, [...prefix, '-m', 'py_compile', harvesterPath], { cwd: root, encoding: 'utf8', shell: false });
  if (c.error || c.status !== 0) throw new Error(`HARVESTER_PY_COMPILE_FAILED:${c.stderr || c.stdout}`);
  writeJson('qualification-summary.json', { ...plan, standing: 'PREQUALIFIED_PLAN_ONLY' });
  console.log('LITERARY_OVERNIGHT_SWEEP=PREQUALIFIED_PLAN_ONLY');
  process.exit(0);
}
const deadlineMs = Date.parse(process.env.A01_QUALIFIER_DEADLINE_UTC || '');
if (!Number.isFinite(deadlineMs)) throw new Error('A01_QUALIFIER_DEADLINE_UTC_REQUIRED');
const preCount = runRegressions('pre');
const shardSummaries = [];
for (let i = 0; i < shards.length; i++) {
  const remainingSeconds = Math.floor((deadlineMs - Date.now()) / 1000) - Number(config.cleanup_margin_seconds || 360);
  const budget = Math.min(config.shard_budget_seconds, remainingSeconds);
  if (budget < 300) { shardSummaries.push({ shard: i + 1, standing: 'SKIPPED_INSUFFICIENT_REMAINING_BUDGET', remaining_seconds: remainingSeconds }); break; }
  const shardDir = path.join(evidence, `research-shard-${String(i + 1).padStart(2, '0')}`);
  fs.mkdirSync(shardDir, { recursive: true });
  const seed = { ...baseSeed, registry_id: `LITERARY-OVERNIGHT-SWEEP-SHARD-${i + 1}`, active_date_new_york: config.active_date_new_york, topics: shards[i], pages_per_query: config.pages_per_query, per_page: config.per_page, request_delay_seconds: config.request_delay_seconds, budget_seconds: budget, curated_sources: i === 0 ? baseSeed.curated_sources : [] };
  const seedPath = path.join(shardDir, 'seed.json');
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
  const r = cp.spawnSync(py, [...prefix, harvesterPath, '--seeds', seedPath, '--output', shardDir, '--budget-seconds', String(budget)], { cwd: root, encoding: 'utf8', shell: false, env: { ...process.env, PYTHONUNBUFFERED: '1' }, timeout: (budget + 90) * 1000, maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(path.join(shardDir, 'wrapper-stdout.txt'), r.stdout || '');
  fs.writeFileSync(path.join(shardDir, 'wrapper-stderr.txt'), r.stderr || '');
  if (r.error || r.status !== 0) throw new Error(`LITERARY_RESEARCH_SHARD_FAILED:${i + 1}:${r.error ? r.error.message : r.status}`);
  const summaryPath = path.join(shardDir, 'harvest_summary.json');
  if (!fs.existsSync(summaryPath)) throw new Error(`LITERARY_RESEARCH_SHARD_SUMMARY_MISSING:${i + 1}`);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  if (summary.standing !== 'PASS') throw new Error(`LITERARY_RESEARCH_SHARD_STANDING_INVALID:${i + 1}:${summary.standing}`);
  if (summary.full_text_acquisition === true || summary.full_text_book_acquisition_performed === true || summary.raw_article_or_book_bodies_persisted === true || summary.named_author_imitation_target === true) throw new Error(`LITERARY_RIGHTS_OR_IMITATION_BOUNDARY_VIOLATION:${i + 1}`);
  shardSummaries.push({ shard: i + 1, topics: shards[i].length, budget_seconds: budget, standing: summary.standing, stop_reason: summary.stop_reason, elapsed_seconds: summary.elapsed_seconds, requests_attempted: summary.requests_attempted, request_failures: summary.request_failures, openalex_unique_works: summary.openalex_unique_works, crossref_unique_works: summary.crossref_unique_works, rights_status: summary.rights_status });
}
const postCount = runRegressions('post');
const totals = shardSummaries.reduce((a, s) => { for (const k of ['requests_attempted','request_failures','openalex_unique_works','crossref_unique_works']) a[k] += Number(s[k] || 0); return a; }, { requests_attempted: 0, request_failures: 0, openalex_unique_works: 0, crossref_unique_works: 0 });
const completed = shardSummaries.filter(s => s.standing === 'PASS').length;
const final = { ...plan, standing: completed > 0 && preCount === postCount ? 'PASS' : 'FAIL', completed_shards: completed, regression_pre_count: preCount, regression_post_count: postCount, totals, shard_summaries: shardSummaries, rights_status: 'CANDIDATE_DISCOVERY_ONLY__STEP_D_MUST_ADJUDICATE', full_text_acquisition: false, raw_user_manuscript_persistence: false, candidate_revision_text_persistence: false, named_author_imitation_target: false };
writeJson('qualification-summary.json', final);
console.log(`LITERARY_OVERNIGHT_SWEEP=${final.standing}`);
if (final.standing !== 'PASS') process.exit(1);
