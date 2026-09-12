#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

mapfile -d '' SOURCES < <(find "$ROOT/src/main/java" "$ROOT/src/test/java" -type f -name '*.java' -print0 | sort -z)
if (( ${#SOURCES[@]} == 0 )); then
  echo "SYSTEM_ROOT_NO_JAVA_SOURCES" >&2
  exit 2
fi

javac --release 21 -Xlint:all -Werror -d "$BUILD" "${SOURCES[@]}"
java -cp "$BUILD" org.systemmaster.foundation.root.SystemRootQualificationTest
java -cp "$BUILD" org.systemmaster.foundation.root.SystemRootPerformanceTest
