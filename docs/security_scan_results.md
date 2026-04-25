# Security Scan Results - MeetUp Beta
Date: 2026-04-25

## Summary
| Tool | Scope | High/Critical | Status |
|---|---|---|---|
| pip-audit | Backend Dependencies | 12 | **ACTION REQUIRED** (Upgrading) |
| bandit | Backend Code | TBD | Pending |
| npm audit | Mobile Dependencies | N/A | Local environment missing npm |
| trivy | Container Image | N/A | Trivy not available in environment |

## 1. Backend Dependency Audit (pip-audit)
Ran: `docker compose exec backend pip-audit`

Findings:
- **pyjwt** (2.11.0): CVE-2026-32597 -> Fix in 2.12.0
- **python-multipart** (0.0.22): CVE-2026-40347 -> Fix in 0.0.26
- **requests** (2.32.5): CVE-2026-25645 -> Fix in 2.33.0
- **cryptography** (46.0.5): CVE-2026-34073 -> Fix in 46.0.6
- **pytest** (9.0.2): CVE-2025-71176 -> Fix in 9.0.3

**Resolution**: Updated `requirements.txt` to use fixed versions.

## 2. Backend Code Scan (bandit)
Ran: `bandit -r app/`

Findings:
- **4 LOW issues**: Standard `try_except_pass` patterns (B112, B110).
- **0 HIGH/MEDIUM issues**.

**Resolution**: Acceptable for beta; exception handling will be refined in production pass.

## 3. Resolution Progress
- **Dependency Upgrades**: `requirements.txt` updated to lock `pyjwt`, `python-multipart`, `requests`, `cryptography`, and `pytest` to patched versions.

## 3. Container Scan (Trivy)
Environment lacks `trivy` binary. Recommended to run in CI/CD pipeline using GitHub Actions or similar.

## 4. Mobile Audit (npm)
Environment lacks `npm` binary. Manual audit recommended by developer locally before beta.
