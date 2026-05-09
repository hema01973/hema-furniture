// load-tests/load.js — Standard load test (50 concurrent users, 10 minutes)
// Run: k6 run load-tests/load.js
// Expected: handles 50 concurrent users with p95 < 3s
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate     = new Rate('error_rate');
const orderLatency  = new Trend('order_create_latency', true);
const searchLatency = new Trend('search_latency', true);
const orderErrors   = new Counter('order_errors');

export const options = {
  stages: [
    { duration: '2m',  target: 10  },  // ramp up
    { duration: '5m',  target: 50  },  // hold at 50 users
    { duration: '2m',  target: 100 },  // spike
    { duration: '1m',  target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_duration:    ['p(95)<3000', 'p(99)<5000'],
    http_req_failed:      ['rate<0.02'],   // < 2% HTTP errors
    error_rate:           ['rate<0.05'],   // < 5% app errors
    order_create_latency: ['p(95)<5000'],  // orders can be slower
    search_latency:       ['p(95)<1500'],  // search must be fast
  },
};

const BASE    = __ENV.BASE_URL    || 'http://localhost:3000';
const CSRF_TK = __ENV.CSRF_TOKEN  || 'test-token';

const HEADERS = {
  'Content-Type': 'application/json',
  'x-csrf-token': CSRF_TK,
};

export default function () {
  group('Browse products', () => {
    // Product listing
    const t0 = Date.now();
    const list = http.get(`${BASE}/api/v1/products?limit=12&sort=newest`);
    searchLatency.add(Date.now() - t0);
    check(list, { 'list 200': r => r.status === 200 });
    errorRate.add(list.status !== 200);
    sleep(1);

    // Search
    const t1 = Date.now();
    const search = http.get(`${BASE}/api/v1/products?q=sofa&limit=12`);
    searchLatency.add(Date.now() - t1);
    check(search, { 'search 200': r => r.status === 200 });
    sleep(0.5);

    // Category filter
    http.get(`${BASE}/api/v1/products?category=living&limit=12`);
    sleep(0.5);
  });

  group('View product detail', () => {
    const slug = 'oslo-sofa-' + Math.floor(Math.random() * 10);
    const prod = http.get(`${BASE}/api/v1/products/${slug}`);
    // 404 is fine — slug may not exist in test env
    check(prod, { 'product not 500': r => r.status !== 500 });
    sleep(1);
  });

  group('Health check', () => {
    const health = http.get(`${BASE}/api/healthz`);
    check(health, { 'healthy': r => r.status === 200 });
    sleep(2);
  });
}

export function handleSummary(data) {
  return {
    'load-tests/results/load-summary.json': JSON.stringify(data, null, 2),
    stdout: `
=== LOAD TEST SUMMARY ===
Total requests:    ${data.metrics.http_reqs.values.count}
Error rate:        ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%
p95 latency:       ${data.metrics.http_req_duration.values['p(95)'].toFixed(0)}ms
p99 latency:       ${data.metrics.http_req_duration.values['p(99)'].toFixed(0)}ms
========================
`,
  };
}
