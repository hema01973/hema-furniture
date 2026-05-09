## Summary
<!-- What does this PR do? Link issue if applicable: Closes #123 -->

## Type of Change
- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 🔒 Security fix
- [ ] ♻️  Refactor
- [ ] 📚 Docs / CI

## Testing
- [ ] Unit tests added / updated and passing
- [ ] Integration tests pass locally
- [ ] E2E tests pass locally (required for checkout/auth changes)

## Security Checklist
- [ ] No secrets, tokens, or credentials in code or comments
- [ ] No `console.log` with sensitive data (use `logger`)
- [ ] Input validated with Zod on new API routes
- [ ] Rate limiting (`failClosed: true`) applied to new auth routes
- [ ] Auth/role check applied to protected endpoints
- [ ] `npm audit --audit-level=high` passes

## Deployment Notes
<!-- Any migrations, env var changes, or manual steps required? -->
