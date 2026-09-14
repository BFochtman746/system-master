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

hr; echo "0. PURGE STALE LOCAL CACHES"; hr
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

hr; echo "4. ASSURANCE STANDARDS"; hr
if out=$(node .github/scripts/assurance-standards-check.js main 2>&1) && [[ "$out" == *'"status":"PASS"'* ]]; then
  ok "assurance-standards-check"
else
  bad "assurance-standards-check"; sed -n '1,3p' <<< "$out" | sed 's/^/        /'
fi

hr
printf 'SUMMARY  pass=%d  fail=%d  skip=%d\n' "$pass" "$fail" "$skip"
if [[ $FORCE_CI_ONLY -eq 0 && $skip -gt 0 ]]; then
  echo "note: skips are CI-only gates. Run ./verify.sh --ci-only to force them."
fi
if [[ $fail -gt 0 ]]; then
  echo "FAILED:"; printf '  - %s\n' "${FAILED[@]}"
  hr; echo "RESULT: FAIL"; exit 1
fi
hr; echo "RESULT: PASS"; exit 0
