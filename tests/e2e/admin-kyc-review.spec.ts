import { expect, test } from '@playwright/test';

const adminUser = {
  id: 'admin-user-1',
  email: 'admin@fueki.test',
  walletAddress: null,
  kycStatus: 'approved',
  helpLevel: 'expert',
  role: 'admin',
  demoActive: false,
  demoUsed: false,
  createdAt: '2026-03-20T00:00:00.000Z',
  updatedAt: '2026-03-20T00:00:00.000Z',
};

test.describe('Admin KYC review', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('fueki-auth-session', JSON.stringify({ active: true }));
      localStorage.setItem('fueki-auth-user', JSON.stringify(user));
    }, adminUser);

    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'header.payload.signature' }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(adminUser),
      });
    });

    await page.route('**/api/admin/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalUsers: 1,
          newUsersLast30Days: 1,
          kycPending: 0,
          kycApproved: 1,
          kycRejected: 0,
          kycNotSubmitted: 0,
          totalSessions: 1,
        }),
      });
    });
  });

  test('renders the KYC tab without crashing when submissions are missing', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.route('**/api/admin/kyc/submissions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      });
    });

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

    await page.getByRole('button', { name: 'KYC Review' }).click();

    await expect(page.getByText('No KYC submissions')).toBeVisible();
    await expect(page.getByLabel('Filter by KYC status')).toHaveAttribute('id', 'kyc-status-filter');
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
