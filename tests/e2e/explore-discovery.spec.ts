import { expect, test } from '@playwright/test';

test.describe('Explore Discovery', () => {
  test('search and filters narrow visible tokenized assets', async ({ page }) => {
    await page.goto('/explore');

    await expect(
      page.getByRole('heading', { name: 'Tokenized Assets' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connect to Trade' })).toHaveCount(6);

    await page.getByLabel('Search tokenized assets').fill('gold');
    await expect(page.getByRole('link', { name: 'Connect to Trade' })).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Gold Reserve Token' }),
    ).toBeVisible();

    await page.getByLabel('Search tokenized assets').clear();
    await page.getByRole('button', { name: 'Commodity' }).click();
    await expect(page.getByRole('link', { name: 'Connect to Trade' })).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'Silver Bullion Reserve' }),
    ).toBeVisible();

    await page.getByLabel('Search tokenized assets').fill('definitely-not-here');
    await expect(page.getByText('No assets found')).toBeVisible();
  });
});
