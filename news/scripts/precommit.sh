#!/usr/bin/env bash
# news/scripts/precommit.sh — Market Beat pre-commit gate
#
# What it does (in order):
#   1. Only acts if files under news/ are staged for commit
#   2. Validates JSON syntax for every staged report*.json
#   3. Runs lint.js --strict on news/report.json (must exit 0)
#   4. Re-renders marketbeat_report.html (fixed name) so it matches report.json
#   5. Auto-stages the re-rendered HTML
#   6. Verifies scoreboard.jsonl + history.jsonl are valid JSONL
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

# ─── 2. Validate JSON syntax for every staged JSON file ────────────────────
say "Validating JSON syntax on staged report files…"
JSON_FILES=$(echo "$STAGED_NEWS" | grep -E '^news/(report\.json|report\.previous\.json|diff\.json|report\.schema\.json)$' || true)
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

# ─── 3. Validate JSONL files line-by-line if staged ────────────────────────
for JSONL in scoreboard.jsonl history.jsonl; do
  if echo "$STAGED_NEWS" | grep -q "^news/${JSONL}\$"; then
    say "Validating ${JSONL} (one JSON per line)…"
    if node -e "
      const fs = require('fs');
      const lines = fs.readFileSync('$NEWS_DIR/${JSONL}','utf8').split('\n').filter(Boolean);
      let bad = 0;
      lines.forEach((l, i) => { try { JSON.parse(l); } catch (e) { console.error('  line '+(i+1)+': '+e.message); bad++; } });
      if (bad) { console.error('  '+bad+' bad lines'); process.exit(1); }
      console.log('  '+lines.length+' valid lines');
    "; then
      ok "${JSONL} is clean"
    else
      die "${JSONL} has invalid lines"
    fi
  fi
done

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

# ─── 5. Re-render HTML if report.json is staged (FIXED NAME) ────────────────
if echo "$STAGED_NEWS" | grep -q '^news/report\.json$'; then
  say "Re-rendering marketbeat_report.html to match the staged report.json…"
  if [ -f "$NEWS_DIR/render.js" ]; then
    DATE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$NEWS_DIR/report.json','utf8')).date)")
    if [ -z "$DATE" ] || [ "$DATE" = "undefined" ]; then
      die "report.json has no .date field"
    fi
    (cd "$NEWS_DIR" && node render.js report.json > /dev/null)
    HTML_FILE="news/marketbeat_report.html"
    if [ -f "$REPO_ROOT/$HTML_FILE" ]; then
      ok "rendered $HTML_FILE (date=$DATE inside file)"
      git add "$REPO_ROOT/$HTML_FILE" 2>/dev/null && ok "auto-staged $HTML_FILE" || true
    else
      warn "expected $HTML_FILE not produced"
    fi
  else
    warn "render.js not found — skipping re-render"
  fi
fi

# ─── 6. Refresh scoreboard_7d.html if scoreboard.jsonl is staged ───────────
if echo "$STAGED_NEWS" | grep -q '^news/scoreboard\.jsonl$'; then
  say "Refreshing scoreboard_7d.html to match scoreboard.jsonl…"
  if [ -f "$NEWS_DIR/scoreboard.js" ]; then
    (cd "$NEWS_DIR" && node scoreboard.js show --days=7 > /dev/null) || warn "scoreboard show failed"
    if [ -f "$NEWS_DIR/scoreboard_7d.html" ]; then
      git add "$REPO_ROOT/news/scoreboard_7d.html" 2>/dev/null && ok "auto-staged news/scoreboard_7d.html" || true
    fi
  fi
fi

# ─── 7. Make sure transient files aren't staged ─────────────────────────────
# Catches: agent scratch (.prompt.md, .patch.json), legacy date-suffixed files,
# and any scoreboard_*d.html OTHER than the canonical scoreboard_7d.html.
LEAKED=$(echo "$STAGED_NEWS" | grep -E '^news/(lint\.prompt\.md|enrich\.prompt\.md|enrich\.patch\.json|report\.[0-9-]+\.json|marketbeat_report_[0-9-]+\.html|marketbeat_diff_[0-9-]+\.html|diff\.[0-9-]+\.json|diff\.json)$' || true)
# Separate check for non-7d scoreboards (grep -E doesn't do negative lookahead)
EXTRA_BOARDS=$(echo "$STAGED_NEWS" | grep -E '^news/scoreboard_[0-9]+d\.html$' | grep -v '^news/scoreboard_7d\.html$' || true)
LEAKED=$(echo -e "$LEAKED\n$EXTRA_BOARDS" | grep -v '^$' || true)
if [ -n "$LEAKED" ]; then
  warn "transient or legacy date-suffixed files staged (consider unstaging):"
  echo "$LEAKED" | sed 's/^/    /'
  echo "    ${DIM}→ this repo uses FIXED filenames (report.json, report.previous.json,${RESET}"
  echo "    ${DIM}   marketbeat_report.html, marketbeat_report.previous.html, marketbeat_diff.html).${RESET}"
  echo "    ${DIM}→ Date-suffixed files are leftovers from the old layout — delete them.${RESET}"
fi

echo ""
echo "${GREEN}${BOLD}✅ all precommit checks passed${RESET}"
echo ""
exit 0
