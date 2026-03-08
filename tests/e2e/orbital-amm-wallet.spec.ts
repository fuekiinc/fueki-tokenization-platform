/**
 * Orbital AMM wallet E2E flow.
 *
 * This suite is gated behind E2E_WALLET_MODE=true because it requires a
 * MetaMask/Synpress-compatible harness and funded test wallet.
 */
import { expect, test } from '@playwright/test';

const walletDescribe = process.env.E2E_WALLET_MODE === 'true' ? test.describe : test.describe.skip;

walletDescribe('Orbital AMM wallet flow', () => {
  test('loads Orbital page and renders swap tab after authenticated wallet session', async ({ page }) => {
    await page.goto('/advanced');

    await expect(page.getByText(/Orbital AMM/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Swap/i })).toBeVisible();
  });
});
