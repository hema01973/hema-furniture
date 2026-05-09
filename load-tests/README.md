# EHema Load Tests

## Prerequisites
```bash
brew install k6          # macOS
# or: https://k6.io/docs/getting-started/installation/
```

## Running Tests

### Smoke Test (quick sanity check, 5 users, 1 min)
```bash
k6 run load-tests/smoke.js -e BASE_URL=https://ehemafurniture.com
```

### Load Test (50 concurrent users, 10 min)
```bash
k6 run load-tests/load.js -e BASE_URL=https://ehemafurniture.com
```

### Stress Test (ramp to 300 users — find breaking point)
```bash
k6 run load-tests/stress.js -e BASE_URL=https://ehemafurniture.com
```

## Acceptance Thresholds (must pass before production launch)
| Metric | Requirement |
|--------|-------------|
| p95 response time | < 3 seconds |
| p99 response time | < 5 seconds |
| Error rate | < 2% at 50 concurrent users |
| Breaking point | ≥ 100 concurrent users |

## Baseline Results (fill in after first run)
- Max concurrent users: **TBD**
- p95 latency at 50 users: **TBD ms**
- Breaking point: **TBD users**
