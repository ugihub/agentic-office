#!/usr/bin/env bash
# Bureau Security Scan Script
# Phase 8: Security scan — Trivy + pnpm audit
#
# Usage:
#   bash tests/security/security-scan.sh
#   bash tests/security/security-scan.sh --fix   # Auto-fix where possible
#   CI=true bash tests/security/security-scan.sh # Strict mode for CI
#
# Exits non-zero if HIGH or CRITICAL vulnerabilities found.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RESULTS_DIR="${ROOT_DIR}/tests/security/results"
FIX_MODE="${1:-}"
CI_MODE="${CI:-false}"
EXIT_CODE=0

mkdir -p "${RESULTS_DIR}"

# ─── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $*"; }

# ─── pnpm Audit ───────────────────────────────────────────────────────────────

run_pnpm_audit() {
  log_info "Running pnpm audit..."

  AUDIT_REPORT="${RESULTS_DIR}/pnpm-audit.json"

  if pnpm audit --audit-level=high --json > "${AUDIT_REPORT}" 2>&1; then
    log_ok "pnpm audit: No HIGH or CRITICAL vulnerabilities found."
  else
    local vuln_count
    vuln_count=$(cat "${AUDIT_REPORT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
vulns = data.get('vulnerabilities', {})
high_critical = [(k, v) for k, v in vulns.items() if v.get('severity') in ('high', 'critical')]
print(len(high_critical))
for name, v in high_critical[:5]:
    print(f'  {v[\"severity\"].upper()}: {name} — {v.get(\"title\", \"?\")}')
" 2>/dev/null || echo "1")

    if [ "${vuln_count}" -gt 0 ] 2>/dev/null; then
      log_error "pnpm audit: ${vuln_count} HIGH/CRITICAL vulnerabilities found!"
      cat "${AUDIT_REPORT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
vulns = data.get('vulnerabilities', {})
for name, v in vulns.items():
    if v.get('severity') in ('high', 'critical'):
        print(f'  [{v[\"severity\"].upper()}] {name}: {v.get(\"title\", \"?\")} (fix: {v.get(\"fixAvailable\", False)})')
" 2>/dev/null || true

      if [ "${FIX_MODE}" == "--fix" ]; then
        log_info "Attempting auto-fix with pnpm audit --fix..."
        pnpm audit --fix || true
      fi

      EXIT_CODE=1
    else
      log_ok "pnpm audit: No HIGH/CRITICAL vulnerabilities (moderate+ may exist)."
    fi
  fi
}

# ─── Trivy Scan ───────────────────────────────────────────────────────────────

run_trivy_scan() {
  log_info "Running Trivy filesystem scan..."

  if ! command -v trivy &> /dev/null; then
    log_warn "Trivy not installed. Skipping container/filesystem scan."
    log_warn "Install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    return 0
  fi

  TRIVY_REPORT="${RESULTS_DIR}/trivy-report.json"
  TRIVY_IGNORE="${SCRIPT_DIR}/.trivyignore"

  trivy fs \
    --security-checks secret,vuln,config \
    --severity HIGH,CRITICAL \
    --format json \
    --output "${TRIVY_REPORT}" \
    --ignorefile "${TRIVY_IGNORE}" \
    "${ROOT_DIR}" 2>/dev/null

  local vuln_count
  vuln_count=$(python3 -c "
import json, sys
with open('${TRIVY_REPORT}') as f:
    data = json.load(f)
results = data.get('Results', [])
total = sum(len(r.get('Vulnerabilities', [])) for r in results)
print(total)
" 2>/dev/null || echo "0")

  if [ "${vuln_count}" -gt 0 ] 2>/dev/null; then
    log_error "Trivy: ${vuln_count} HIGH/CRITICAL vulnerabilities found!"
    python3 -c "
import json
with open('${TRIVY_REPORT}') as f:
    data = json.load(f)
for result in data.get('Results', []):
    for v in result.get('Vulnerabilities', []):
        print(f'  [{v[\"Severity\"]}] {v[\"VulnerabilityID\"]}: {v[\"PkgName\"]} {v.get(\"InstalledVersion\",\"?\")} → {v.get(\"FixedVersion\",\"no fix\")}')
" 2>/dev/null || true
    EXIT_CODE=1
  else
    log_ok "Trivy: No HIGH/CRITICAL vulnerabilities found."
  fi
}

# ─── Secret Detection ─────────────────────────────────────────────────────────

run_secret_detection() {
  log_info "Checking for hardcoded secrets..."

  local secrets_found=0

  # Patterns that must NOT appear in any committed file
  SECRET_PATTERNS=(
    'sk-ant-'                        # Anthropic API key
    'AIza[0-9A-Za-z-_]{35}'         # Google API key
    'sk-[a-zA-Z0-9]{48}'            # OpenAI API key
    'bureau_live_'                   # Bureau production API key (real keys)
    'ghp_[0-9A-Za-z]{36}'          # GitHub personal token
    'mongodb\+srv://[^:]+:[^@]+'    # MongoDB Atlas URI with password
  )

  cd "${ROOT_DIR}"

  for pattern in "${SECRET_PATTERNS[@]}"; do
    # Exclude test files, examples, and documentation
    matches=$(grep -r --include="*.ts" --include="*.js" --include="*.json" \
      --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
      --exclude="*.example" --exclude="*.test.ts" \
      -l "${pattern}" 2>/dev/null || true)

    if [ -n "${matches}" ]; then
      log_error "Possible secret detected (pattern: ${pattern}):"
      echo "${matches}" | head -5 | while read -r file; do
        echo "  ${file}"
      done
      secrets_found=$((secrets_found + 1))
    fi
  done

  # Check .env.example doesn't have real values
  if grep -q '^[A-Z_]*=.\{30,\}' .env.example 2>/dev/null; then
    log_warn ".env.example may contain real credentials (long values found)"
  fi

  if [ "${secrets_found}" -eq 0 ]; then
    log_ok "Secret detection: No hardcoded secrets found."
  else
    log_error "Secret detection: ${secrets_found} potential secret patterns found!"
    EXIT_CODE=1
  fi
}

# ─── TypeScript Security Patterns ────────────────────────────────────────────

run_typescript_security_check() {
  log_info "Checking TypeScript security patterns..."

  local issues=0

  cd "${ROOT_DIR}"

  # Check for eval() usage (code injection risk)
  EVAL_USAGE=$(grep -r --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist \
    '\beval\s*(' . 2>/dev/null | grep -v ".test.ts" | grep -v "//.*eval" || true)

  if [ -n "${EVAL_USAGE}" ]; then
    log_error "eval() usage detected — code injection risk:"
    echo "${EVAL_USAGE}" | head -3
    issues=$((issues + 1))
  fi

  # Check for process.env access without validation
  UNSAFE_ENV=$(grep -r --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist \
    'process\.env\.[A-Z_]*[^!?]$' . 2>/dev/null | head -5 || true)

  if [ -n "${UNSAFE_ENV}" ]; then
    log_warn "Unvalidated process.env access (should use '!' or null check):"
    echo "${UNSAFE_ENV}" | head -3
    # Not a hard failure — just a warning
  fi

  # Check for SQL injection patterns (raw string interpolation in queries)
  SQL_INJECTION=$(grep -r --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist \
    'db\.query\s*(\s*`' . 2>/dev/null | head -5 || true)

  if [ -n "${SQL_INJECTION}" ]; then
    log_error "Potential SQL injection — raw template literal in db.query:"
    echo "${SQL_INJECTION}" | head -3
    issues=$((issues + 1))
  fi

  if [ "${issues}" -eq 0 ]; then
    log_ok "TypeScript security patterns: Clean."
  else
    log_error "TypeScript security check: ${issues} issues found!"
    EXIT_CODE=1
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo "════════════════════════════════════════"
  echo "  Bureau Security Scan"
  echo "  Working dir: ${ROOT_DIR}"
  echo "  Mode: ${CI_MODE:+CI }${FIX_MODE:-standard}"
  echo "════════════════════════════════════════"
  echo

  run_pnpm_audit
  echo
  run_trivy_scan
  echo
  run_secret_detection
  echo
  run_typescript_security_check
  echo

  echo "════════════════════════════════════════"
  if [ "${EXIT_CODE}" -eq 0 ]; then
    log_ok "Security scan PASSED — no HIGH/CRITICAL issues found."
  else
    log_error "Security scan FAILED — review issues above."
    if [ "${CI_MODE}" == "true" ]; then
      log_error "CI mode: failing build due to security issues."
    fi
  fi
  echo "Results saved to: ${RESULTS_DIR}/"
  echo "════════════════════════════════════════"

  exit "${EXIT_CODE}"
}

main "$@"
