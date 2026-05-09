#!/usr/bin/env bash
# scripts/protect-branches.sh — V015: FIX #9 — GitHub branch protection
#
# Run ONCE after repository setup:
#   bash scripts/protect-branches.sh
#
# Requires: gh auth login (GitHub CLI with repo admin rights)
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo '')"
if [[ -z "$REPO" ]]; then echo "❌  Run: gh auth login"; exit 1; fi

echo "🔒  Applying branch protection to $REPO ..."

for BRANCH in main develop; do
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "/repos/$REPO/branches/$BRANCH/protection" \
    --field required_status_checks='{"strict":true,"contexts":["ESLint","TypeScript","Jest Tests","Next.js Build","npm audit"]}' \
    --field enforce_admins=true \
    --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
    --field restrictions=null \
    --field allow_force_pushes=false \
    --field allow_deletions=false \
    --silent && echo "  ✅  $BRANCH protected" \
             || echo "  ⚠️   $BRANCH: create the branch first, then re-run"
done

echo ""
echo "✅  Done. Developers must now open PRs and pass all CI checks before merging."
