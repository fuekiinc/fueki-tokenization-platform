/**
 * Responsive layout checks for core public pages.
 */
import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 375, height: 812, label: 'mobile' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 1024, height: 768, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
];
const ASSERT_SCREENSHOTS = process.env.PLAYWRIGHT_ASSERT_SCREENSHOTS === 'true';

test.describe('Responsive layouts', () => {
  for (const viewport of VIEWPORTS) {
    test(`explore page layout is stable at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/explore');

      await expect(page.getByRole('heading', { name: 'Asset Tokenization' })).toBeVisible();

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasOverflow).toBe(false);

      if (ASSERT_SCREENSHOTS) {
        await expect(page).toHaveScreenshot(`explore-${viewport.label}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      }
    });
  }
});
