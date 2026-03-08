/**
 * Authentication form validation checks.
 */
import { expect, test } from '@playwright/test';

test.describe('Auth validation', () => {
  test('login page enforces required fields', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.getByText(/Email is required/i)).toBeVisible();
    await expect(page.getByText(/Password is required/i)).toBeVisible();
  });

  test('signup account step validates password policy', async ({ page }) => {
    await page.goto('/signup');

    const emailInput = page.locator('#signup-email');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('newuser@fueki.test');
    await page.locator('#signup-password').fill('weak');
    await page.locator('#signup-confirmPassword').fill('weak');

    await page.getByRole('button', { name: /Continue/i }).click();

    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });
});
