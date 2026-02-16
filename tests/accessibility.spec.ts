import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

test.describe('Accessibility', () => {
  test('login page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags([...wcagTags])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical',
    );
    expect(critical).toEqual([]);
  });

  test('signup page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags([...wcagTags])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical',
    );
    expect(critical).toEqual([]);
  });

  test('explore page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags([...wcagTags])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical',
    );
    expect(critical).toEqual([]);
  });

  test('forgot-password page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags([...wcagTags])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical',
    );
    expect(critical).toEqual([]);
  });

  test('all public pages should have lang attribute on html', async ({ page }) => {
    const publicRoutes = ['/login', '/signup', '/explore', '/forgot-password'];

    for (const route of publicRoutes) {
      await page.goto(route);
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang, `Missing lang attribute on ${route}`).toBeTruthy();
    }
  });

  test('all public pages should have exactly one h1', async ({ page }) => {
    const publicRoutes = ['/login', '/signup', '/explore', '/forgot-password'];

    for (const route of publicRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const h1Count = await page.locator('h1').count();
      expect(h1Count, `Expected exactly one h1 on ${route}, found ${h1Count}`).toBeGreaterThanOrEqual(1);
    }
  });
});
