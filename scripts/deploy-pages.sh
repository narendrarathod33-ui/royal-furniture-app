#!/usr/bin/env bash
# Deploy the built app (dist/) to a gh-pages checkout WITHOUT breaking people
# whose browser still holds a cached index.html from an earlier round.
#
# Rules:
#   - hashed assets are ADDITIVE: `_expo/` and `assets/` are only ever added to,
#     never deleted — a stale cached page must always find its files;
#   - only the entry points are replaced (index.html, metadata.json, favicon);
#   - `.nojekyll` MUST exist: without it GitHub Pages runs Jekyll, which
#     silently excludes the underscore-prefixed `_expo/` directory and every
#     app bundle 404s (this broke the live site for the whole r3.7..r3.9.1
#     window — never deploy without it);
#   - the published companions survive (.nojekyll, app-prototype.html,
#     background-schemes.html, scheme-pngs/, shots/, version.json);
#   - anything else stale at the top level (e.g. a retired /v2 folder) is removed
#     explicitly by name, never by a blanket wipe.
#
# Usage: scripts/deploy-pages.sh /path/to/gh-pages-checkout
set -euo pipefail

DIST="$(cd "$(dirname "$0")/.." && pwd)/dist"
TARGET="${1:?usage: deploy-pages.sh /path/to/gh-pages-checkout}"

test -f "$DIST/index.html"
test -e "$TARGET/.git"                            # checkout or worktree

cp -r "$DIST/." "$TARGET/"                        # additive for _expo/ and assets/
rm -rf "$TARGET/v2"                               # retired build, never publish
: > "$TARGET/.nojekyll"                           # self-heal: Jekyll must stay off
test -f "$TARGET/.nojekyll"
printf '%s\n' 'deployed rounds keep their assets; entry points replaced; .nojekyll enforced.'
echo "next: update $TARGET/version.json, then git add -A && git commit && git push origin HEAD:gh-pages"
