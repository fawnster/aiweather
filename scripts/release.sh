#!/bin/sh
# Deploy aiweather to Synteq: ship only the app as committed (server, web and shared code, the root package files),
# never the design/QA screenshots and recordings, the test fixtures or anything uncommitted.
#   first time:  scripts/release.sh --create aiweather --plan free
#   afterwards:  scripts/release.sh --app aiweather
# Needs `synteq login` once, in your own terminal.
set -eu
cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain -- server/src web shared package.json package-lock.json scripts/build.mjs)" ]; then
  echo "Uncommitted app changes: commit them first (only committed code ships)." >&2
  exit 1
fi
out="$(mktemp -d)/aiweather"
mkdir -p "$out"
git archive HEAD server/src server/package.json server/tsconfig.json web shared scripts/build.mjs package.json package-lock.json | tar -x -C "$out"
echo "Packed $(git rev-parse --short HEAD): $(du -sh "$out" | cut -f1) in $out"
synteq deploy --dir "$out" "$@"
