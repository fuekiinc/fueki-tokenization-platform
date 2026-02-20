/**
 * Mobile detection and wallet deep-linking utilities.
 *
 * All helpers are designed for client-side use and rely on
 * `navigator.userAgent` and `window.ethereum` -- they gracefully
 * return safe defaults when executed in a non-browser environment.
 */

// ---------------------------------------------------------------------------
// Mobile device detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the current user-agent belongs to a mobile device
 * (phones and tablets on iOS, Android, Windows Phone, etc.).
 */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

// ---------------------------------------------------------------------------
// In-app browser detection
// ---------------------------------------------------------------------------

/** Known wallet in-app browser identifiers found in user-agent strings. */
const IN_APP_BROWSER_PATTERNS = [
  /MetaMaskMobile/i,
  /Trust/i,
  /CoinbaseWallet/i,
  /TokenPocket/i,
  /imToken/i,
  /SAFE/i,
] as const;

/**
 * Returns `true` when the page is loaded inside a wallet's in-app
 * browser (MetaMask Mobile, Trust Wallet, Coinbase Wallet, etc.).
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  return IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(ua));
}

// ---------------------------------------------------------------------------
// Injected provider detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `window.ethereum` (an EIP-1193 provider) is present.
 */
export function hasInjectedProvider(): boolean {
  if (typeof window === "undefined") return false;

  return typeof (window as WindowWithEthereum).ethereum !== "undefined";
}

/** Minimal typing so we can reference `window.ethereum` safely. */
interface WindowWithEthereum extends Window {
  ethereum?: unknown;
}

// ---------------------------------------------------------------------------
// Deep-link generation
// ---------------------------------------------------------------------------

type WalletId = "metamask" | "trust" | "coinbase";

type DeepLinkBuilder = (url: URL) => string;

const DEEP_LINK_BUILDERS: Record<WalletId, DeepLinkBuilder> = {
  metamask: (url) =>
    `https://metamask.app.link/dapp/${url.hostname}${url.pathname}${url.search}${url.hash}`,

  trust: (url) =>
    `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url.toString())}`,

  coinbase: (url) =>
    `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url.toString())}`,
};

/**
 * Returns the deep-link URL that opens the current dApp page inside the
 * specified wallet's in-app browser.
 *
 * Supported `walletId` values: `"metamask"`, `"trust"`, `"coinbase"`.
 *
 * @param walletId - Identifier of the target wallet.
 * @returns The fully-formed deep-link string, or `null` when the wallet
 *          is not supported or the function is called server-side.
 */
export function getMobileWalletDeepLink(walletId: string): string | null {
  if (typeof window === "undefined") return null;

  const builder = DEEP_LINK_BUILDERS[walletId as WalletId];
  if (!builder) return null;

  const currentUrl = new URL(window.location.href);
  return builder(currentUrl);
}

// ---------------------------------------------------------------------------
// Composite check
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the user is on a mobile device, is **not** already
 * inside a wallet's in-app browser, and no injected EIP-1193 provider
 * (`window.ethereum`) is available.
 *
 * This is the primary guard for triggering a "open in wallet" prompt in
 * the UI.
 */
export function needsMobileWalletRedirect(): boolean {
  return isMobile() && !isInAppBrowser() && !hasInjectedProvider();
}
