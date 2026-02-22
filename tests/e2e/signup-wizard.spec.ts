import { expect, test } from '@playwright/test';

test.describe('Signup Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('users can progress through steps and keep prior data when navigating back', async ({
    page,
  }) => {
    await page.goto('/signup');

    await expect(
      page.getByRole('heading', { level: 2, name: 'Create your account' }),
    ).toBeVisible();

    await page.locator('#signup-email').fill('new.user@fueki.example');
    await page.locator('#signup-password').fill('FuekiPass123!');
    await page.locator('#signup-confirmPassword').fill('FuekiPass123!');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Personal information' })).toBeVisible();
    await page.getByLabel('First name').fill('Alex');
    await page.getByLabel('Last name').fill('Rivera');
    await page.getByLabel('Date of birth').fill('1990-01-15');
    await page.getByLabel('Phone number').fill('+12125551234');
    await page.getByText('Minimal', { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Your address' })).toBeVisible();
    await page.getByLabel('Street address').fill('123 Main Street');
    await page.getByLabel('City').fill('New York');
    await page.getByLabel('State / Province').fill('NY');
    await page.getByLabel('ZIP / Postal code').fill('10001');
    await page.getByLabel('Country').selectOption('United States');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible();
    await page.getByRole('button', { name: /\$1,800/ }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Your address' })).toBeVisible();
    await expect(page.getByLabel('City')).toHaveValue('New York');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible();
    await page.getByRole('button', { name: /\$1,800/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Identity verification' })).toBeVisible();
    await page.getByLabel('Social Security Number').fill('123456789');
    await page.getByText('Passport', { exact: true }).click();
    await page.getByRole('button', { name: 'Complete sign-up' }).click();

    await expect(
      page.getByText('Please upload an identity document to continue.'),
    ).toBeVisible();
  });
});
