#!/usr/bin/env bash
set -euo pipefail

subject_root="$(cd "${1:-.}" && pwd)"
legacy_root="$(cd "${2:-$subject_root}" && pwd)"
component_rel="system-master/foundation-spine/root-authority-registry"
component_root="$subject_root/$component_rel"
if [[ ! -d "$component_root" ]]; then
  echo "ROOT_REGISTRY_QUALIFICATION_FAIL:missing component root $component_root" >&2
  exit 1
fi
if [[ ! -f "$legacy_root/governance/CURRENT-AUTHORITY.json" ]]; then
  echo "ROOT_REGISTRY_QUALIFICATION_FAIL:missing live legacy authority under $legacy_root" >&2
  exit 1
fi

work_dir="$(mktemp -d)"
classes="$work_dir/classes"
manifest="$work_dir/bootstrap.tsv"
snapshot="$work_dir/root-registry.bin"
evidence_dir="${ROOT_REGISTRY_EVIDENCE_DIR:-$work_dir/evidence}"
mkdir -p "$classes" "$evidence_dir"

cleanup() {
  status=$?
  if [[ -n "${ROOT_REGISTRY_PERSIST_EVIDENCE_TO:-}" ]]; then
    mkdir -p "$ROOT_REGISTRY_PERSIST_EVIDENCE_TO"
    cp -R "$evidence_dir"/. "$ROOT_REGISTRY_PERSIST_EVIDENCE_TO"/ 2>/dev/null || true
  fi
  rm -rf "$work_dir"
  exit "$status"
}
trap cleanup EXIT

subject_sha="$(git -C "$subject_root" rev-parse HEAD 2>/dev/null || printf 'UNVERSIONED')"
legacy_sha="$(git -C "$legacy_root" rev-parse HEAD 2>/dev/null || printf 'UNVERSIONED')"
printf 'subject_sha=%s\nlegacy_sha=%s\n' "$subject_sha" "$legacy_sha" | tee "$evidence_dir/subject.txt"
if command -v git >/dev/null 2>&1; then
  git -C "$subject_root" hash-object "$component_root"/src/main/java/org/systemmaster/foundation/root/*.java \
    "$component_root"/src/test/java/org/systemmaster/foundation/root/*.java \
    | tee "$evidence_dir/source-blob-hashes.txt"
fi

mapfile -t java_sources < <(find "$component_root/src/main/java" "$component_root/src/test/java" -name '*.java' -type f | sort)
if [[ ${#java_sources[@]} -eq 0 ]]; then
  echo 'ROOT_REGISTRY_QUALIFICATION_FAIL:no Java sources' >&2
  exit 1
fi

{
  echo "javac_version=$(javac -version 2>&1)"
  javac --release 21 -Xlint:all -Werror -d "$classes" "${java_sources[@]}"
  echo 'STRICT_COMPILE_PASS'
} | tee "$evidence_dir/compile.txt"

java -cp "$classes" org.systemmaster.foundation.root.RootAuthorityRegistryQualificationTest \
  | tee "$evidence_dir/qualification.txt"

node "$component_root/migration/generate-root-registry-bootstrap.js" \
  "$legacy_root" "$manifest" "commit:$subject_sha" "system-master/control-v2" \
  | tee "$evidence_dir/migration.txt"

java -cp "$classes" org.systemmaster.foundation.root.RootAuthorityRegistryBootstrapCli \
  "$manifest" "$snapshot" "bootstrap-$subject_sha" \
  "decision:legacy-root-cutover-qualification" "actor:hosted-qualification" \
  "live legacy topology migration qualification" "2026-09-11T23:00:00Z" "SYSTEM_MASTER" \
  | tee "$evidence_dir/bootstrap.txt"

java -cp "$classes" org.systemmaster.foundation.root.RootAuthorityRegistryPerformanceTest 100 500 500 \
  | tee "$evidence_dir/performance-realistic.txt"

if [[ "${ROOT_REGISTRY_RUN_STRESS:-1}" == "1" ]]; then
  java -cp "$classes" org.systemmaster.foundation.root.RootAuthorityRegistryPerformanceTest 5000 5000 5000 \
    | tee "$evidence_dir/performance-stress.txt"
fi

{
  echo 'ROOT_AUTHORITY_REGISTRY_QUALIFICATION_PASS'
  echo "subject_sha=$subject_sha"
  echo "legacy_sha=$legacy_sha"
  echo "evidence_class=${ROOT_REGISTRY_EVIDENCE_CLASS:-PORTABLE}"
} | tee "$evidence_dir/result.txt"
