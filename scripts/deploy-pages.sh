#!/usr/bin/env bash
# Build The Word's web client and publish it to the gh-pages branch, which
# GitHub Pages serves at https://amosroger91.github.io/The-Word/.
#
# One command, no CI: builds locally, then force-pushes the static output to
# gh-pages. Pushing the Pages source branch makes GitHub rebuild the site
# automatically (usually live within a minute). Run from anywhere:
#
#     bash scripts/deploy-pages.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="https://github.com/amosroger91/The-Word.git"

echo "==> Building web client (base /The-Word/)…"
cd "$ROOT"
# MSYS_NO_PATHCONV stops Git Bash on Windows from rewriting the leading-slash base path.
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' BASE_PATH=/The-Word/ npm run build:web

DIST="$ROOT/apps/web/dist"
[ -f "$DIST/index.html" ] || { echo "Build produced no dist/index.html — aborting." >&2; exit 1; }

echo "==> Publishing dist/ to gh-pages…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -r "$DIST/." "$TMP/"
touch "$TMP/.nojekyll"   # tell GitHub Pages not to run Jekyll over the built site

cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -f "$REMOTE" gh-pages

echo "==> Done. GitHub Pages is rebuilding; it should be live within a minute at:"
echo "    https://amosroger91.github.io/The-Word/"
