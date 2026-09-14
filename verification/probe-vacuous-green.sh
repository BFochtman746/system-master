#!/usr/bin/env bash
# Prove the Maven/JUnit bridge cannot return green when qualification discovery collapses.
# This is a destructive probe inside the checkout only; every moved source is restored.
set -euo pipefail

cd "$(dirname "$0")/.."

MIN_EXPECTED_CLASSES=20
PROBE_TARGET=$((MIN_EXPECTED_CLASSES - 1))

mapfile -t candidates < <(
  while IFS= read -r -d '' file; do
    if grep -Eq 'static[[:space:]]+void[[:space:]]+main[[:space:]]*\(' "$file"; then
      printf '%s\n' "$file"
    fi
  done < <(find system-master -type f -name '*Test.java' -print0 | sort -z)
)

count=${#candidates[@]}
if (( count < MIN_EXPECTED_CLASSES )); then
  echo "VACUOUS_GREEN_PROBE=FAIL baseline_test_sources=$count minimum=$MIN_EXPECTED_CLASSES"
  exit 1
fi

remove_count=$((count - PROBE_TARGET))
probe_dir=$(mktemp -d)
declare -a moved=()

restore() {
  local rel
  for rel in "${moved[@]:-}"; do
    if [[ -n "$rel" && -f "$probe_dir/$rel" ]]; then
      mkdir -p "$(dirname "$rel")"
      mv "$probe_dir/$rel" "$rel"
    fi
  done
  rm -rf "$probe_dir"
}
trap restore EXIT

for ((i=0; i<remove_count; i++)); do
  rel=${candidates[$i]}
  mkdir -p "$probe_dir/$(dirname "$rel")"
  mv "$rel" "$probe_dir/$rel"
  moved+=("$rel")
done

rm -rf target
log=$(mktemp)
set +e
mvn -B test >"$log" 2>&1
rc=$?
set -e

if (( rc == 0 )); then
  echo "VACUOUS_GREEN_PROBE=FAIL mvn_test_unexpectedly_green removed=$remove_count remaining=$PROBE_TARGET"
  tail -40 "$log"
  rm -f "$log"
  exit 1
fi

if ! grep -Eq "discovered only[[:space:]]+$PROBE_TARGET[[:space:]]+qualification classes" "$log"; then
  echo "VACUOUS_GREEN_PROBE=FAIL wrong_failure_mode removed=$remove_count remaining=$PROBE_TARGET"
  tail -60 "$log"
  rm -f "$log"
  exit 1
fi

rm -f "$log"
echo "VACUOUS_GREEN_PROBE=PASS baseline=$count removed=$remove_count discovered=$PROBE_TARGET expected_failure=discovery_floor"
