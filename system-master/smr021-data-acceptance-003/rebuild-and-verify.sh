#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$ROOT/reconstructed}"
ARCHIVE="$OUT/SMR021_DATA001_PORTABLE_ACCEPTED_SOURCE_TEST_CANDIDATE_003.tar.xz"
TREE="$OUT/tree"
rm -rf "$OUT" && mkdir -p "$OUT" "$TREE"
for required in "$ROOT"/source-payload/part-{000,001,002,003}.b64 "$ROOT/RUNNABLE_SHA256_MANIFEST.txt"; do
  [ -f "$required" ] || { echo "SOURCE_CUSTODY_BLOCKED missing=$required" >&2; exit 40; }
done
cat "$ROOT"/source-payload/part-*.b64 | tr -d '\n' | base64 -d > "$ARCHIVE"
EXPECTED_SHA='02ef249ca7c8a549e3a9a3d21a671f32b3d15432272b218f53c1844176150197'
EXPECTED_BYTES='189936'
ACTUAL_SHA=$(sha256sum "$ARCHIVE" | awk '{print $1}')
ACTUAL_BYTES=$(stat -c %s "$ARCHIVE")
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ]
[ "$ACTUAL_BYTES" = "$EXPECTED_BYTES" ]
tar -xJf "$ARCHIVE" -C "$TREE"
(cd "$TREE" && sha256sum -c "$ROOT/RUNNABLE_SHA256_MANIFEST.txt" >/dev/null)
echo "SMR021_GITHUB_CUSTODY_RECONSTRUCTION=PASS SHA256=$ACTUAL_SHA FILES=447"
