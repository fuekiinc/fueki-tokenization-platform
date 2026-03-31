import { ethers } from 'ethers';
import type { CurrentNav, NavAttestation, NavTimeRange } from '../types/nav';

export interface NavChartPoint {
  label: string;
  isoDate: string;
  timestamp: number;
  navPerToken: number;
  totalNAV: number;
}

export interface NavPremiumDiscount {
  percent: number;
  direction: 'premium' | 'discount' | 'at-nav';
}

export const NAV_TIME_RANGES: NavTimeRange[] = ['3M', '6M', '1Y', 'ALL'];

export function parseNavNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getNavCacheKey(tokenAddress: string, chainId: number): string {
  return `fueki:nav:${chainId}:${tokenAddress.toLowerCase()}`;
}

export function readCachedCurrentNav(
  tokenAddress: string,
  chainId: number,
): CurrentNav | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getNavCacheKey(tokenAddress, chainId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as CurrentNav;
  } catch {
    return null;
  }
}

export function writeCachedCurrentNav(
  tokenAddress: string,
  chainId: number,
  currentNav: CurrentNav | null,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const key = getNavCacheKey(tokenAddress, chainId);
  if (!currentNav) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(currentNav));
}

export function subtractMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() - months);
  return copy;
}

export function filterNavAttestationsByRange(
  attestations: NavAttestation[],
  range: NavTimeRange,
  now: Date = new Date(),
): NavAttestation[] {
  if (range === 'ALL') {
    return [...attestations];
  }

  const cutoff =
    range === '3M'
      ? subtractMonths(now, 3)
      : range === '6M'
        ? subtractMonths(now, 6)
        : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  return attestations.filter((attestation) => new Date(attestation.effectiveDate) >= cutoff);
}

export function toNavChartPoints(attestations: NavAttestation[]): NavChartPoint[] {
  return [...attestations]
    .sort(
      (left, right) =>
        new Date(left.effectiveDate).getTime() - new Date(right.effectiveDate).getTime(),
    )
    .map((attestation) => {
      const date = new Date(attestation.effectiveDate);
      return {
        label: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        }),
        isoDate: attestation.effectiveDate,
        timestamp: date.getTime(),
        navPerToken: parseNavNumber(attestation.navPerToken),
        totalNAV: parseNavNumber(attestation.totalNAV),
      };
    });
}

export function computePremiumDiscount(
  navPerToken: string | number,
  listedPrice: string | number,
): NavPremiumDiscount | null {
  const nav = parseNavNumber(navPerToken);
  const price = parseNavNumber(listedPrice);

  if (!Number.isFinite(nav) || !Number.isFinite(price) || nav <= 0 || price <= 0) {
    return null;
  }

  const percent = ((price - nav) / nav) * 100;
  if (Math.abs(percent) < 0.005) {
    return { percent: 0, direction: 'at-nav' };
  }

  return {
    percent,
    direction: percent > 0 ? 'premium' : 'discount',
  };
}

export function isUsdStableSymbol(symbol: string | null | undefined): boolean {
  if (!symbol) {
    return false;
  }

  const normalized = symbol.trim().toUpperCase();
  return ['USD', 'USDC', 'USDT', 'DAI', 'USDE', 'USDS', 'FDUSD', 'PYUSD'].includes(normalized);
}

export function calculateQuotedNavAmount(
  tokenAmount: string,
  navPerToken: string,
): string {
  const amount = parseNavNumber(tokenAmount);
  const nav = parseNavNumber(navPerToken);
  if (amount <= 0 || nav <= 0) {
    return '';
  }

  return (amount * nav).toFixed(2);
}

export function getNavStalenessState(
  daysSinceLastUpdate: number | null,
  warningDays: number,
  criticalDays: number,
): 'fresh' | 'warning' | 'critical' {
  if (daysSinceLastUpdate === null) {
    return 'fresh';
  }

  if (daysSinceLastUpdate >= criticalDays) {
    return 'critical';
  }

  if (daysSinceLastUpdate >= warningDays) {
    return 'warning';
  }

  return 'fresh';
}

export async function computeFileKeccakHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buffer));
}
