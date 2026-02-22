import { expect, type Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;
const publicRoutes = [
  { route: '/login', heading: /Welcome back/i },
  { route: '/signup', heading: /Create Your Account/i },
  { route: '/explore', heading: /Explore the Fueki/i },
  { route: '/forgot-password', heading: /Forgot password\?/i },
] as const;

async function gotoPublicRoute(
  page: Page,
  route: (typeof publicRoutes)[number]['route'],
  heading: (typeof publicRoutes)[number]['heading'],
): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
}

async function getCriticalViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('main')
    .withTags([...wcagTags])
    .analyze();

  return results.violations.filter((violation) => violation.impact === 'critical');
}

test.describe('Accessibility', () => {
  for (const { route, heading } of publicRoutes) {
    test(`${route} should have no critical accessibility violations`, async ({
      page,
    }) => {
      await gotoPublicRoute(page, route, heading);
      const critical = await getCriticalViolations(page);
      expect(critical).toEqual([]);
    });
  }

  test('all public pages should have lang attribute on html', async ({ page }) => {
    for (const { route, heading } of publicRoutes) {
      await gotoPublicRoute(page, route, heading);
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang, `Missing lang attribute on ${route}`).toBeTruthy();
    }
  });

  test('all public pages should expose at least one heading', async ({ page }) => {
    for (const { route, heading } of publicRoutes) {
      await gotoPublicRoute(page, route, heading);
      const headingCount = await page.getByRole('heading').count();
      expect(
        headingCount,
        `Expected at least one heading on ${route}, found ${headingCount}`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
