import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const handlers = [
  http.get('*/api/auth/me', () => {
    return HttpResponse.json({
      id: 'msw-user-1',
      email: 'msw@fueki.test',
      role: 'user',
      kycStatus: 'approved',
      helpLevel: 'novice',
      demoActive: false,
      demoUsed: false,
    });
  }),
  http.get('*/api/kyc/status', () => {
    return HttpResponse.json({ status: 'pending' });
  }),
  http.post('*/api/auth/login', async () => {
    return HttpResponse.json({
      user: {
        id: 'msw-user-1',
        email: 'msw@fueki.test',
        role: 'user',
        kycStatus: 'approved',
        helpLevel: 'novice',
        demoActive: false,
        demoUsed: false,
      },
      tokens: { accessToken: 'header.payload.signature' },
    });
  }),
];

export const server = setupServer(...handlers);
