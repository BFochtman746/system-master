#!/usr/bin/env bash
# verify.sh — the one command that tells you the truth about this repository.
#
#   ./verify.sh              # everything runnable on a developer machine
#   ./verify.sh --ci-only    # also force the two CI-only gates (needs CI-shaped state)
#
# Exit code is honest: 0 only when everything that ran actually passed. Skips are
# reported as skips and never inflate a pass.
#
# Background: `mvn test` used to print BUILD SUCCESS while running zero tests, and 14
# of 21 qualifiers died off CI on a missing GitHub Actions variable. Both are fixed;
# this script is the single entry point that keeps them honest.
set -uo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

FORCE_CI_ONLY=0
[[ "${1:-}" == "--ci-only" ]] && FORCE_CI_ONLY=1 && export SYSTEM_MASTER_RUN_CI_ONLY=1

pass=0; fail=0; skip=0
declare -a FAILED=()

hr() { printf '%s\n' "------------------------------------------------------------"; }
ok()   { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); FAILED+=("$1"); }
skipd(){ printf '  SKIP  %s\n' "$1"; skip=$((skip+1)); }

hr; echo "0. TOOLCHAIN + PURGE STALE LOCAL CACHES"; hr
# F-WP-001's authoritative manifest declares the Java release used by the qualifier.
# Fail once, clearly, instead of cascading the same javac incompatibility through
# F-WP-001..012 and obscuring the real prerequisite.
required_java=$(node -p "require('./system-master/f-wp-001/control/SOURCE-SLICE-MANIFEST.json').java_release || 21" 2>/dev/null || printf '21')
if ! javac_line=$(javac -version 2>&1); then
  echo "  FAIL  toolchain — javac unavailable; F-WP qualifiers require Java ${required_java}+"
  echo "RESULT: FAIL"
  exit 1
fi
javac_major=$(sed -E 's/^javac ([0-9]+).*/\1/' <<< "$javac_line")
if ! [[ "$javac_major" =~ ^[0-9]+$ ]] || (( javac_major < required_java )); then
  echo "  FAIL  toolchain — F-WP qualifiers require javac ${required_java}+; found: ${javac_line}"
  echo "RESULT: FAIL"
  exit 1
fi
echo "  toolchain: ${javac_line} (required >= ${required_java})"

# Off CI, RUNNER_TEMP is unset and the qualify scripts fall back to workspace/.tmp,
# where they cache COMPILED CLASSES. A stale entry there silently poisoned a
# verification run once already (L-012): the qualifier ran an old class and reported a
# failure that did not exist in the source. Verification must start from nothing.
rm -rf .tmp qualification-output
echo "  purged .tmp/ qualification-output/"

hr; echo "1. BUILD (mvn compile)"; hr
if mvn -q -B compile > /tmp/verify-compile.log 2>&1; then
  classes=$(find target/classes -name '*.class' 2>/dev/null | wc -l | tr -d ' ')
  ok "compile ($classes classes)"
else
  bad "compile"; tail -25 /tmp/verify-compile.log | sed 's/^/        /'
fi

hr; echo "2. TESTS (mvn test — real execution via the JUnit bridge)"; hr
if mvn -B test > /tmp/verify-test.log 2>&1; then
  line=$(grep -E "^\[INFO\] Tests run:" /tmp/verify-test.log | tail -1 | sed 's/^\[INFO\] //')
  # A "success" that ran nothing is the exact failure this repo already had once.
  if grep -qE "Tests run: [1-9]" /tmp/verify-test.log; then
    ok "mvn test — ${line:-tests ran}"
  else
    bad "mvn test reported success but ran ZERO tests (vacuous green regression)"
  fi
else
  bad "mvn test"
  grep -E "Tests run:|<<< (FAILURE|ERROR)|\[ERROR\]" /tmp/verify-test.log | head -20 | sed 's/^/        /'
fi

hr; echo "3. QUALIFIERS (.github/scripts/*qualify*)"; hr
for s in $(ls .github/scripts | grep qualify | grep -E '\.(js|py)$' | sort); do
  case "$s" in
    *.js) interp=node ;;
    *.py) interp=python3 ;;
  esac
  out=$("$interp" ".github/scripts/$s" 2>&1)
  rc=$?
  if [[ $rc -eq 0 ]]; then
    if [[ "$out" == SKIP* ]]; then
      skipd "$s — ${out%% *} $(sed -n '1s/.*reason=\([^ ]*\).*/\1/p' <<< "$out")"
    else
      ok "$s"
    fi
  else
    bad "$s"
    sed -n '1,3p' <<< "$out" | sed 's/^/        /'
  fi
done

hr; echo "4. FOUNDATION CLOSURE CURRENT-INVENTORY AUTHORITY"; hr
# The current matrix must enumerate exclusively from CURRENT-AUTHORITY's selected
# capability crosswalk. Historical census/P6 allocation artifacts remain evidence,
# never inventory authority. The generator also fail-closes if current allocation
# contains an owned/deferred module that the selected crosswalk omits or disagrees on.
if matrix_summary=$(node .github/scripts/foundation-closure-matrix.js --summary 2>&1); then
  if MATRIX_SUMMARY="$matrix_summary" node - <<'NODE'
const summary = JSON.parse(process.env.MATRIX_SUMMARY);
const authority = require('./governance/CURRENT-AUTHORITY.json');
const guard = summary.inventory_guard || {};
if (summary.inventory_source !== authority.capability_crosswalk) process.exit(1);
if (guard.source !== authority.capability_crosswalk) process.exit(1);
if (guard.historical_inventory_fallback !== false) process.exit(1);
if (summary.total_rows !== guard.capability_count + guard.platform_count) process.exit(1);
NODE
  then
    ok "foundation-closure-matrix current crosswalk inventory authority"
  else
    bad "foundation-closure-matrix inventory authority assertion"
    sed -n '1,12p' <<< "$matrix_summary" | sed 's/^/        /'
  fi
else
  bad "foundation-closure-matrix current inventory generation"
  sed -n '1,12p' <<< "$matrix_summary" | sed 's/^/        /'
fi

# The checked-in human-readable projection is also authoritative operational input.
# It must not lag the generator after an authority, crosswalk, allocation, contract,
# or evidence change. Compare semantic row identity/ownership/state rather than a
# timestamp or prose rendering so formatting changes do not create false failures.
if out=$(node .github/scripts/foundation-closure-matrix-committed-check.js 2>&1); then
  ok "foundation-closure-matrix committed projection freshness"
else
  bad "foundation-closure-matrix committed projection freshness"
  sed -n '1,8p' <<< "$out" | sed 's/^/        /'
fi

hr; echo "5. ASSURANCE STANDARDS"; hr
# Resolve the base through the checker's portable default (`origin/main`) instead of
# requiring a local branch literally named `main`; GitHub PR merge checkouts are detached.
# The checker emits compact JSON for "no changes" and pretty JSON when files changed.
# Accept either serialization; status is semantic, whitespace is not.
if out=$(node .github/scripts/assurance-standards-check.js 2>&1) \
   && grep -qE '"status"[[:space:]]*:[[:space:]]*"PASS"' <<< "$out"; then
  ok "assurance-standards-check"
else
  bad "assurance-standards-check"; sed -n '1,3p' <<< "$out" | sed 's/^/        /'
fi

hr; echo "6. CONTROL-GATEWAY SUITE (control-gateway/test)"; hr
# WHY THIS SECTION EXISTS.
# Sections 1-5 gate the Java core and the .github/scripts qualifiers. They never touched
# control-gateway/test — 31 node tests and 2 python tests covering chat-session admission,
# single-writer mutation admission, the dispatch bridge and the CG-008..CG-011 authority
# chain. Every one of them is referenced by CI workflows, so they ran on a pull request and
# never on a developer machine. A gate that only exists in CI is a gate you cannot use while
# you work: it turns "I verified locally" into a claim about a subset nobody wrote down.
#
# THE FLOOR IS LOAD-BEARING. A loop over a glob that matches nothing runs zero tests and
# reports success. That is exactly how the qualifier reporter came to print pass=0 fail=-1
# while fail-closing on nothing, and how the first version of the document-truth audit
# skipped .github/ and reported clean after inspecting no files. So this section refuses to
# pass unless it discovered at least the number of tests known to exist. Adding tests is
# free; losing them is a hard failure.
CG_MIN_TESTS=33
cg_node_files=$(ls control-gateway/test/*.js 2>/dev/null | wc -l | tr -d ' ')
cg_py_files=$(ls control-gateway/test/*.py control-gateway/python/*test*.py 2>/dev/null | wc -l | tr -d ' ')
cg_discovered=$((cg_node_files + cg_py_files))

if (( cg_discovered < CG_MIN_TESTS )); then
  bad "control-gateway suite — discovery floor: found ${cg_discovered} test files, expected >= ${CG_MIN_TESTS}"
  echo "        A suite that discovers nothing passes vacuously. If tests were"
  echo "        intentionally removed, lower CG_MIN_TESTS in the same commit."
else
  cg_pass=0; cg_fail=0
  declare -a CG_FAILED=()
  for t in control-gateway/test/*.js; do
    [[ -f "$t" ]] || continue
    if timeout 120 node "$t" > /tmp/verify-cg.log 2>&1; then
      cg_pass=$((cg_pass+1))
    else
      cg_fail=$((cg_fail+1)); CG_FAILED+=("$t")
    fi
  done
  for t in control-gateway/test/*.py control-gateway/python/*test*.py; do
    [[ -f "$t" ]] || continue
    if timeout 120 python3 "$t" > /tmp/verify-cg.log 2>&1; then
      cg_pass=$((cg_pass+1))
    else
      cg_fail=$((cg_fail+1)); CG_FAILED+=("$t")
    fi
  done
  if (( cg_fail > 0 )); then
    bad "control-gateway suite — ${cg_fail} of ${cg_discovered} failed (${cg_pass} passed)"
    printf '        red: %s\n' "${CG_FAILED[@]}"
  else
    ok "control-gateway suite (${cg_pass} tests, floor ${CG_MIN_TESTS})"
  fi
fi

hr
printf 'SUMMARY  pass=%d  fail=%d  skip=%d\n' "$pass" "$fail" "$skip"
if [[ $FORCE_CI_ONLY -eq 0 && $skip -gt 0 ]]; then
  echo "note: skips are exact-subject/CI-only gates. Run ./verify.sh --ci-only to force CI-only applicability checks."
fi
if [[ $fail -gt 0 ]]; then
  echo "FAILED:"; printf '  - %s\n' "${FAILED[@]}"
  hr; echo "RESULT: FAIL"; exit 1
fi
hr; echo "RESULT: PASS"; exit 0
