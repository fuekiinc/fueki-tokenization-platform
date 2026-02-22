import { expect, test } from '@playwright/test';

test.describe('Help Guidance Onboarding', () => {
  test('signup includes help-level selector and allows switching tiers', async ({ page }) => {
    await page.goto('/signup');

    await page.locator('#signup-email').fill('guidance.user@fueki.example');
    await page.locator('#signup-password').fill('FuekiPass123!');
    await page.locator('#signup-confirmPassword').fill('FuekiPass123!');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Help mode')).toBeVisible();

    const guided = page.getByRole('radio', { name: /Guided/i });
    const balanced = page.getByRole('radio', { name: /Balanced/i });
    const minimal = page.getByRole('radio', { name: /Minimal/i });

    await expect(guided).toBeChecked();
    await page.getByText('Balanced', { exact: true }).click();
    await expect(balanced).toBeChecked();
    await page.getByText('Minimal', { exact: true }).click();
    await expect(minimal).toBeChecked();
  });
});
