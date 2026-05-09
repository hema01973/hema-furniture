// load-tests/stress.js — Stress test to find breaking point
// Run: k6 run load-tests/stress.js
// Purpose: find max capacity before degradation
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m',  target: 50  },
    { duration: '2m',  target: 100 },
    { duration: '2m',  target: 200 },
    { duration: '2m',  target: 300 },
    { duration: '2m',  target: 0   },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed:   ['rate<0.10'],  // allow up to 10% errors in stress
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE}/api/v1/products?limit=12`);
  check(res, { 'status ok': r => r.status < 500 });
  sleep(0.3);
}
