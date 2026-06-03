#!/usr/bin/env bash
# news/scripts/precommit.sh — Market Beat pre-commit gate
#
# What it does (in order):
#   1. Only acts if files under news/ are staged for commit
#   2. Validates JSON syntax for every staged report*.json
#   3. Runs lint.js --strict on news/report.json (must exit 0)
#   4. Re-renders marketbeat_report_<date>.html so it matches report.json
#   5. Auto-stages the re-rendered HTML + snapshot
#   6. Verifies scoreboard.jsonl is valid JSONL
#
# Install as a git hook (one-time):
#     ln -sf ../../news/scripts/precommit.sh .git/hooks/pre-commit
#   or:
#     cp news/scripts/precommit.sh .git/hooks/pre-commit
#     chmod +x .git/hooks/pre-commit
#
# Bypass for emergencies:
#     git commit --no-verify
#
# Exit codes:
#   0  all checks passed (or nothing to check)
#   1  a check failed — commit aborted

set -euo pipefail

# ─── colors ─────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'
  DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; DIM=''; BOLD=''; RESET=''
fi

say()  { echo "${CYAN}▶${RESET} $*"; }
ok()   { echo "  ${GREEN}✓${RESET} $*"; }
warn() { echo "  ${YELLOW}⚠${RESET} $*"; }
die()  { echo "  ${RED}✗${RESET} $*"; echo ""; echo "${RED}${BOLD}❌ commit aborted${RESET} — fix the issue above, re-stage, retry."; echo "${DIM}   (to bypass in emergencies: git commit --no-verify)${RESET}"; exit 1; }

# ─── locate repo root + news dir ────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
NEWS_DIR="$REPO_ROOT/news"

if [ ! -d "$NEWS_DIR" ]; then
  # No news/ folder in this repo — nothing to do.
  exit 0
fi

# ─── 0. anything under news/ staged? ────────────────────────────────────────
STAGED_NEWS=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^news/' || true)
if [ -z "$STAGED_NEWS" ]; then
  # No news/ changes in this commit — skip silently.
  exit 0
fi

echo ""
echo "${BOLD}🔍 Market Beat precommit checks${RESET}"
echo "${DIM}   staged news/ files: $(echo "$STAGED_NEWS" | wc -l | tr -d ' ')${RESET}"
echo ""

# ─── 1. Node available? ─────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  die "node not found in PATH — install Node ≥ 20 to use this hook"
fi
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  warn "Node $(node --version) detected — recommend ≥ 20"
fi

# ─── 2. Validate JSON syntax for every staged report*.json ──────────────────
say "Validating JSON syntax on staged report files…"
JSON_FILES=$(echo "$STAGED_NEWS" | grep -E '^news/(report\.json|report\.[0-9-]+\.json|diff\.[0-9-]+\.json|report\.schema\.json)$' || true)
if [ -n "$JSON_FILES" ]; then
  for f in $JSON_FILES; do
    if [ -f "$REPO_ROOT/$f" ]; then
      if node -e "JSON.parse(require('fs').readFileSync('$REPO_ROOT/$f','utf8'))" 2>/dev/null; then
        ok "valid JSON: $f"
      else
        die "invalid JSON: $f"
      fi
    fi
  done
else
  ok "no JSON files in staged set"
fi

# ─── 3. Validate scoreboard.jsonl line-by-line if staged ────────────────────
if echo "$STAGED_NEWS" | grep -q '^news/scoreboard\.jsonl$'; then
  say "Validating scoreboard.jsonl (one JSON per line)…"
  if node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('$NEWS_DIR/scoreboard.jsonl','utf8').split('\n').filter(Boolean);
    let bad = 0;
    lines.forEach((l, i) => { try { JSON.parse(l); } catch (e) { console.error('  line '+(i+1)+': '+e.message); bad++; } });
    if (bad) { console.error('  '+bad+' bad lines'); process.exit(1); }
    console.log('  '+lines.length+' valid lines');
  "; then
    ok "scoreboard.jsonl is clean"
  else
    die "scoreboard.jsonl has invalid lines"
  fi
fi

# ─── 4. Lint report.json (must pass --strict) ───────────────────────────────
if [ -f "$NEWS_DIR/report.json" ]; then
  say "Linting news/report.json (--strict)…"
  if [ -f "$NEWS_DIR/lint.js" ]; then
    # Suppress the full output unless it fails; show summary either way
    LINT_OUT=$(cd "$NEWS_DIR" && node lint.js --strict 2>&1) || LINT_FAIL=1
    SUMMARY=$(echo "$LINT_OUT" | grep -E '^📊 Summary' || true)
    [ -n "$SUMMARY" ] && echo "  $SUMMARY"
    if [ "${LINT_FAIL:-0}" = "1" ]; then
      echo ""
      echo "$LINT_OUT" | grep -E '^  ERROR' | head -20
      echo ""
      # Generate the fix prompt so an agent / human knows what's wrong
      (cd "$NEWS_DIR" && node lint.js --strict --fix-prompt > /dev/null 2>&1) || true
      if [ -f "$NEWS_DIR/lint.prompt.md" ]; then
        warn "fix list written to news/lint.prompt.md"
      fi
      die "report.json failed lint --strict"
    fi
    ok "lint passed (warnings ok, errors none)"
  else
    warn "lint.js not found — skipping lint check"
  fi
fi

# ─── 5. Re-render HTML if report.json is staged ─────────────────────────────
if echo "$STAGED_NEWS" | grep -q '^news/report\.json$'; then
  say "Re-rendering HTML so it matches the staged report.json…"
  if [ -f "$NEWS_DIR/render.js" ]; then
    DATE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$NEWS_DIR/report.json','utf8')).date)")
    if [ -z "$DATE" ] || [ "$DATE" = "undefined" ]; then
      die "report.json has no .date field"
    fi
    (cd "$NEWS_DIR" && node render.js report.json > /dev/null)
    HTML_FILE="news/marketbeat_report_${DATE}.html"
    if [ -f "$REPO_ROOT/$HTML_FILE" ]; then
      ok "rendered $HTML_FILE"
      # Auto-stage the regenerated HTML
      git add "$REPO_ROOT/$HTML_FILE" 2>/dev/null && ok "auto-staged $HTML_FILE" || true

      # Also snapshot to report.<date>.json and stage it
      SNAP_FILE="news/report.${DATE}.json"
      cp "$NEWS_DIR/report.json" "$REPO_ROOT/$SNAP_FILE"
      git add "$REPO_ROOT/$SNAP_FILE" 2>/dev/null && ok "auto-staged $SNAP_FILE (daily snapshot)" || true
    else
      warn "expected $HTML_FILE not produced"
    fi
  else
    warn "render.js not found — skipping re-render"
  fi
fi

# ─── 6. Make sure transient files aren't staged ─────────────────────────────
LEAKED=$(echo "$STAGED_NEWS" | grep -E '^news/(lint\.prompt\.md|enrich\.prompt\.md|enrich\.patch\.json|scoreboard_[0-9]+d\.html)$' || true)
if [ -n "$LEAKED" ]; then
  warn "transient files staged (consider unstaging):"
  echo "$LEAKED" | sed 's/^/    /'
  echo "    ${DIM}→ these are regenerated daily; add them to .gitignore${RESET}"
fi

echo ""
echo "${GREEN}${BOLD}✅ all precommit checks passed${RESET}"
echo ""
exit 0
