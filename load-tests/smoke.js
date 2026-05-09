// load-tests/smoke.js — Quick smoke test (5 users, 1 minute)
// Run: k6 run load-tests/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate  = new Rate('errors');
const apiLatency = new Trend('api_latency', true);

export const options = {
  vus:      5,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests < 2s
    http_req_failed:   ['rate<0.01'],   // < 1% errors
    errors:            ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Homepage
  const home = http.get(`${BASE}/`);
  check(home, { 'homepage 200': r => r.status === 200 });
  errorRate.add(home.status !== 200);

  sleep(0.5);

  // Products API
  const start = Date.now();
  const products = http.get(`${BASE}/api/v1/products?limit=12`);
  apiLatency.add(Date.now() - start);
  check(products, {
    'products 200':    r => r.status === 200,
    'products has data': r => {
      try { return JSON.parse(r.body).success === true; } catch { return false; }
    },
  });
  errorRate.add(products.status !== 200);

  sleep(0.5);

  // Healthz
  const health = http.get(`${BASE}/api/healthz`);
  check(health, { 'healthz ok': r => r.status === 200 });

  sleep(1);
}
