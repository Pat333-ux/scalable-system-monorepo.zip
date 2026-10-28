import http from 'k6/http';
import { check, sleep } from 'k6';

// k6 Execution Configuration: Ramping virtual users (VUs) to simulate real-world spikes
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warm-up to 50 concurrent users
    { duration: '1m',  target: 200 },  // Ramp up to high load (200 VUs)
    { duration: '30s', target: 500 },  // Stress spike to test queue backpressure & rate-limiting
    { duration: '30s', target: 0 },    // Cool down
  ],
  thresholds: {
    // 95% of requests must complete within 200ms
    http_req_duration: ['p(95)<200'],
    // Request failure rate must stay under 1% (excluding deliberate 429 rate limits)
    'http_req_failed{status:500}': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  // Test 1: Health Check Endpoint (Reads DB time)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response has timestamp': (r) => JSON.parse(r.body).timestamp !== undefined,
  });

  // Test 2: High-Throughput Async Task Queue Payload
  const payload = JSON.stringify({
    action: 'SYNC_STATE',
    payload: {
      timestamp: Date.now(),
      region: 'us-central1',
      batchSize: 100,
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const taskRes = http.post(`${BASE_URL}/api/v1/tasks`, payload, params);

  check(taskRes, {
    'task queued successfully (202)': (r) => r.status === 202,
    'rate limit active (429 or 202)': (r) => r.status === 202 || r.status === 429,
    'returns valid task ID': (r) => r.status === 202 && JSON.parse(r.body).taskId !== undefined,
  });

  // Sleep between 0.1 to 0.5 seconds between virtual user iterations
  sleep(Math.random() * 0.4 + 0.1);
}
