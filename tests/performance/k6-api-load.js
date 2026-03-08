import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    health_sustained: {
      executor: 'ramping-arrival-rate',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 8,
      maxVUs: 32,
      stages: [
        { duration: '1m', target: 4 },
        { duration: '3m', target: 6 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2500'],
  },
};

const BASE_URL = __ENV.FUEKI_API_URL || 'https://fueki-backend-pojr5zp2oq-uc.a.run.app';

export default function () {
  const res = http.get(`${BASE_URL}/health`);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(0.25);
}
