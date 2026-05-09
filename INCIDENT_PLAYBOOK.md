# EHema Furniture — Production Incident Playbook

> Version: 8.0 | Last updated: 2026-04-21

---

## 🚨 Severity Levels

| Level | Definition | Response Time | Examples |
|-------|-----------|---------------|---------|
| SEV-1 | Complete outage — site down or payments broken | **15 min** | Site 500, all payments failing |
| SEV-2 | Partial outage — major feature broken | **1 hour** | Checkout broken, login failing |
| SEV-3 | Degraded performance — slow or intermittent | **4 hours** | High latency, some errors |
| SEV-4 | Minor bug — no revenue impact | **Next business day** | UI glitch, minor UX issue |

---

## 📞 Contacts

| Role | Name | WhatsApp | Escalate after |
|------|------|----------|----------------|
| Lead Dev | [NAME] | +20-xxx | 15 min |
| DB Admin | [NAME] | +20-xxx | 30 min |
| DevOps | [NAME] | +20-xxx | 30 min |
| Business Owner | [NAME] | +20-xxx | SEV-1 only |

---

## 🛠️ Runbooks

### RB-01: Site Completely Down (SEV-1)

**Detection:** Uptime monitor fires OR customers report 503  
**Dashboard:** https://ehemafurniture.com/api/healthz

```bash
# 1. Check deployment status
vercel list --limit=5

# 2. Check logs (last 100 error lines)
vercel logs --limit=100 --since=1h | grep '"level":"error"'

# 3. If Vercel is healthy, check MongoDB
# Go to: https://cloud.mongodb.com → Clusters → Metrics

# 4. Force redeploy from last good SHA
git log --oneline -10  # find last good commit
vercel deploy --prod --force

# 5. If MongoDB is down → failover
# Atlas: Clusters → ... → Test Failover
```

**Rollback command:**
```bash
vercel rollback [previous-deployment-url] --token=$VERCEL_TOKEN
```

---

### RB-02: Payment Failures (SEV-1)

**Detection:** Sentry alert: `domain=payment, priority=critical` OR Slack `#incidents`

```bash
# 1. Check Paymob status
curl https://accept.paymob.com/api/auth/tokens -d '{"api_key":"$PAYMOB_API_KEY"}'
# Expected: { token: "..." }

# 2. Check circuit breaker status
curl https://ehemafurniture.com/api/healthz
# Look for "circuits" field

# 3. Check failed orders in DB
# MongoDB: db.orders.find({ paymentStatus: 'failed', createdAt: { $gte: new Date(Date.now()-3600000) } }).count()

# 4. If Paymob is down:
#    → Enable COD-only mode (set PAYMENT_GATEWAY_DISABLED=true in Vercel env)
#    → Update site banner: "Online payments temporarily unavailable"

# 5. Once Paymob recovers:
#    → Remove PAYMENT_GATEWAY_DISABLED
#    → Redeploy
#    → Retry failed orders: they can use /api/v1/orders/:id/retry-payment
```

---

### RB-03: Database Connectivity Issues (SEV-1/2)

```bash
# 1. Check MongoDB Atlas status: https://status.mongodb.com/

# 2. Test connection manually
mongosh "$MONGODB_URI" --eval 'db.adminCommand("ping")'

# 3. If connection pool exhausted:
#    → Temporarily reduce MONGODB_POOL_SIZE in Vercel env to 5
#    → Redeploy

# 4. If data corrupted → restore from backup
# Find latest backup: aws s3 ls s3://$BACKUP_S3_BUCKET/backups/ | tail -5
# Download: aws s3 cp s3://$BUCKET/backups/ehema_backup_YYYYMMDD.tar.gz .
# Restore:  bash scripts/restore.sh ehema_backup_YYYYMMDD.tar.gz --confirm
```

---

### RB-04: Redis Down — Rate Limiting Offline (SEV-2)

```bash
# Impact: failClosed=true routes (login, register, orders) will BLOCK
# Auth routes will fail → users can't log in!

# 1. Check Redis (Upstash): https://console.upstash.com

# 2. Immediate mitigation:
#    Set REDIS_URL='' in Vercel env → in-memory fallback activates
#    Note: rate limiting becomes per-instance (not global) — acceptable short-term

# 3. Once Redis is restored:
#    Restore REDIS_URL in Vercel env → redeploy
```

---

### RB-05: High Error Rate (SEV-2/3)

**Detection:** Sentry error rate > 5% OR Slack alert

```bash
# 1. Identify top errors in Sentry
#    → Filter by last 1h, sort by frequency

# 2. Check if correlated with deployment
vercel list --limit=10  # recent deployments?

# 3. If new deployment caused it → instant rollback
vercel rollback

# 4. If external service → enable graceful degradation
#    Check circuit breakers at /api/healthz

# 5. Document the incident (see Post-Mortem template below)
```

---

### RB-06: Data Breach Suspected (SEV-1)

```bash
# IMMEDIATE ACTIONS (do all in parallel):

# 1. Notify business owner IMMEDIATELY
# 2. Rotate ALL secrets in Vercel dashboard:
#    NEXTAUTH_SECRET, PAYMOB_*, SMTP_PASS, REDIS_URL, MONGODB_URI
# 3. Invalidate all active sessions:
#    MongoDB: db.sessions.deleteMany({})
# 4. Check access logs for suspicious patterns
# 5. Contact legal/compliance team
# 6. Do NOT delete evidence — preserve logs
```

---

## 📝 Post-Mortem Template

```markdown
## Incident: [TITLE] — [DATE]

**Severity:** SEV-X  
**Duration:** HH:MM  
**Affected users:** ~N  
**Revenue impact:** ~X EGP  

### Timeline
- HH:MM — First alert fired
- HH:MM — Engineer paged
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — All clear

### Root Cause
[One clear sentence]

### What Went Well
-

### What Went Wrong
-

### Action Items
| Action | Owner | Due date |
|--------|-------|----------|
|        |       |          |
```

---

## 🔍 Useful Commands

```bash
# Live logs
vercel logs --follow

# DB stats
mongosh "$MONGODB_URI" --eval '
  print("Orders today:", db.orders.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }))
  print("Failed payments:", db.orders.countDocuments({ paymentStatus: "failed", createdAt: { $gte: new Date(Date.now()-3600000) } }))
'

# Redis info
redis-cli -u "$REDIS_URL" INFO server | grep -E "version|uptime|connected"

# Force cache clear (Redis)
redis-cli -u "$REDIS_URL" FLUSHDB  # ⚠️ use with caution
```

---

## ✅ Post-Incident Checklist

- [ ] All systems healthy (healthz returns 200)
- [ ] No open P1/P2 Sentry issues
- [ ] Affected customers notified (if applicable)
- [ ] Post-mortem document written
- [ ] Action items created in project tracker
- [ ] Playbook updated with new learnings
