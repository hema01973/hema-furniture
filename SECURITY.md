# Security Policy

## Supported Versions

| Version | Supported         |
|---------|-------------------|
| 15.x    | ✅ Active          |
| 14.x    | 🔧 Security only  |
| < 14    | ❌ No support     |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **security@hemafurniture.com** with:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact

You will receive acknowledgement within **48 hours**.
Critical issues patched within **7 days**.

---

## Security Controls (V037)

| Control | Implementation |
|---------|---------------|
| Secrets | Validated at startup — blocklist rejects known-insecure defaults, `process.exit(1)` on failure |
| CSP | Nonce-based per-request, `strict-dynamic`, no `unsafe-inline` in production + `report-uri` for violation monitoring |
| Rate limiting | Redis sliding-window, **fail-closed** on all auth routes |
| Password hashing | `@node-rs/argon2` — argon2id (memoryCost=64MiB, timeCost=3, parallelism=4) — OWASP recommended |
| MFA | TOTP via `otplib` + individually argon2id-hashed backup codes |
| Migration | Legacy bcrypt hashes (`$2b$`) require password reset — no silent fallback in production |
| Sessions | NextAuth JWT in `HttpOnly` + `Secure` + `SameSite=Lax` cookies |
| Input validation | Zod schemas on every API route |
| Email sanitisation | DOMPurify server-side via jsdom |
| Order IDs | Atomic MongoDB `$inc` counter — no race conditions |
| DB credentials | Required in production — startup fails otherwise |
| IP spoofing | `X-Forwarded-For` trusted only behind Vercel, Cloudflare, or `TRUST_PROXY=true` |
| Webhooks | Paymob HMAC-SHA512 via `crypto.timingSafeEqual` |
| Circuit breakers | Paymob, Cloudinary, Email |
| Permission versioning | JWT `pv` field invalidated immediately on role change |
| Audit log | TTL index — auto-deleted after 365 days (updated in V043; was 90 days) to meet PCI-DSS retention requirements |
