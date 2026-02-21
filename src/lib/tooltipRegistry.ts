import type { HelpLevel } from '../types/auth';
import { HELP_LEVEL_ORDER } from './helpLevels';

type LevelBody = {
  novice: string;
  intermediate?: string;
  expert?: string;
};

type LevelOptional = Partial<Record<HelpLevel, string>>;

export interface TooltipDefinition {
  title?: string;
  bodyByLevel: LevelBody;
  learnMoreByLevel?: LevelOptional;
  riskNoteByLevel?: LevelOptional;
  isProductSpecific?: boolean;
  minHelpLevelToShow?: HelpLevel;
  expertVisible?: boolean;
  expertLearnMore?: boolean;
  riskCritical?: boolean;
  links?: string[];
}

export const VALID_INTERNAL_HELP_ROUTES = new Set<string>([
  '/mint',
  '/exchange',
  '/advanced',
  '/security-tokens',
  '/security-tokens/deploy',
  '/terms',
  '/privacy',
]);

export const TOOLTIP_REGISTRY = {
  'mint.mintAmount': {
    title: 'Mint Amount',
    bodyByLevel: {
      novice: 'This sets how many tokens you create from this asset. Keep it aligned with the asset value and issuance policy.',
      intermediate: 'Number of tokens to mint for this issuance.',
      expert: 'Token quantity minted in this transaction.',
    },
    learnMoreByLevel: {
      novice: 'Minting expands circulating supply immediately. Review holder allocation and compliance policy before signing.',
    },
    minHelpLevelToShow: 'novice',
    links: ['/mint'],
  },
  'mint.mintAuthority': {
    title: 'Mint Authority',
    bodyByLevel: {
      novice: 'Mint authority is the wallet allowed to issue new supply. If this is wrong, token supply control can be lost.',
      intermediate: 'Wallet with permission to mint additional tokens.',
      expert: 'Issuer authority for supply expansion.',
    },
    riskNoteByLevel: {
      novice: 'Set to a controlled wallet or governance contract. Avoid personal hot wallets for production issuance.',
      intermediate: 'Incorrect authority creates irreversible supply-control risk.',
      expert: 'Authority misconfiguration is a permanent control failure.',
    },
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/security-tokens/deploy', '/terms'],
  },
  'mint.decimals': {
    title: 'Decimals',
    bodyByLevel: {
      novice: 'Decimals define how many fractional units each token supports. For most assets, 18 is standard unless your legal units require a different precision.',
      intermediate: 'Fractional precision for token balances and transfers.',
      expert: 'ERC-20 decimal precision.',
    },
    learnMoreByLevel: {
      novice: 'Changing decimals alters downstream accounting displays and integrations. Decide once and keep it consistent.',
      intermediate: 'Precision changes impact indexers and accounting pipelines.',
    },
    minHelpLevelToShow: 'intermediate',
    links: ['/security-tokens/deploy'],
  },
  'mint.documentHash': {
    title: 'Document Hash',
    bodyByLevel: {
      novice: 'This hash anchors your legal/financial document on-chain. Anyone can verify the same file by recomputing and matching the hash.',
      intermediate: 'Cryptographic commitment to the source document.',
      expert: 'On-chain SHA-256 commitment pointer.',
    },
    minHelpLevelToShow: 'intermediate',
    links: ['/mint'],
  },
  'security.transferRestrictions': {
    title: 'Transfer Restrictions',
    bodyByLevel: {
      novice: 'Transfer restrictions enforce who can send or receive security tokens. They are core compliance controls, not optional UX settings.',
      intermediate: 'Policy layer that gates transfers by jurisdiction, group, or investor status.',
      expert: 'Rule-engine transfer gating for ERC-1404 compliance.',
    },
    learnMoreByLevel: {
      novice: 'Use restrictions together with investor groups and whitelist controls to prevent invalid secondary transfers.',
      intermediate: 'Restrictions should map directly to counsel-approved rule sets.',
      expert: 'Validate rule matrix and revert reasons before go-live.',
    },
    isProductSpecific: true,
    expertVisible: true,
    expertLearnMore: true,
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/security-tokens', '/security-tokens/deploy', '/terms'],
  },
  'security.roleAssignments': {
    title: 'Admin Roles',
    bodyByLevel: {
      novice: 'Roles control who can mint, pause, and manage investors. Grant only to operationally approved wallets.',
      intermediate: 'Contract roles define privileged permissions and emergency controls.',
      expert: 'RBAC surface for issuer operations.',
    },
    riskNoteByLevel: {
      novice: 'Over-privileged roles increase issuer risk. Use least privilege and hardware wallets for role owners.',
      intermediate: 'Over-broad grants increase blast radius.',
      expert: 'Follow least-privilege + cold-signing.',
    },
    isProductSpecific: true,
    expertVisible: true,
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/security-tokens'],
  },
  'security.whitelist': {
    title: 'Investor Whitelist',
    bodyByLevel: {
      novice: 'Only approved investors should be whitelisted for restricted offerings. Keep whitelist records synced with KYC/AML decisions.',
      intermediate: 'Whitelist determines transfer eligibility for restricted holders.',
      expert: 'Address allowlist for compliant transfer paths.',
    },
    isProductSpecific: true,
    expertVisible: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/security-tokens'],
  },
  'security.complianceDisclosure': {
    title: 'Compliance Disclosure',
    bodyByLevel: {
      novice: 'Disclosures communicate legal terms, transfer limits, and investor obligations. They should match your offering documents exactly.',
      intermediate: 'Disclosure text should reflect active compliance controls and investor rights.',
      expert: 'Disclosure copy must match governing legal docs.',
    },
    isProductSpecific: true,
    expertVisible: true,
    minHelpLevelToShow: 'expert',
    links: ['/terms', '/privacy'],
  },
  'security.timelock': {
    title: 'Minimum Timelock',
    bodyByLevel: {
      novice: 'Timelock amount defines when transfer lock rules start applying. Use it to enforce vesting and holding periods.',
      intermediate: 'Threshold amount that triggers timelock logic.',
      expert: 'Transfer lock activation threshold.',
    },
    isProductSpecific: true,
    expertVisible: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/security-tokens/deploy'],
  },
  'security.releaseDelay': {
    title: 'Max Release Delay',
    bodyByLevel: {
      novice: 'Release delay limits how long restricted balances remain locked. Align with your policy and investor communications.',
      intermediate: 'Upper bound for timelock release windows.',
      expert: 'Max lock duration parameter.',
    },
    isProductSpecific: true,
    expertVisible: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/security-tokens/deploy'],
  },
  'swap.slippage': {
    title: 'Slippage Tolerance',
    bodyByLevel: {
      novice: 'Slippage is the maximum price movement you accept before the transaction reverts. Lower values protect price, higher values improve fill chance.',
      intermediate: 'Max execution drift allowed from quote price.',
      expert: 'Execution tolerance bound.',
    },
    riskNoteByLevel: {
      novice: 'High slippage can fill at materially worse prices during volatility.',
      intermediate: 'Wide slippage increases adverse execution risk.',
      expert: 'Loose tolerance widens MEV/adverse fill exposure.',
    },
    learnMoreByLevel: {
      novice: 'Use lower slippage for deep pools and stable pairs. Increase only when liquidity is thin or markets are moving quickly.',
      intermediate: 'Tune tolerance by liquidity depth and volatility regime.',
      expert: 'Calibrate against depth and expected reprice velocity.',
    },
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/exchange', '/advanced'],
  },
  'swap.priceImpact': {
    title: 'Price Impact',
    bodyByLevel: {
      novice: 'Price impact estimates how much your own order moves the pool price. Large orders on shallow liquidity can be expensive.',
      intermediate: 'Expected pool price movement caused by this order size.',
      expert: 'Self-induced execution impact.',
    },
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/exchange', '/advanced'],
  },
  'swap.minReceived': {
    title: 'Minimum Received',
    bodyByLevel: {
      novice: 'This is the least output token amount you will accept after slippage. If execution falls below this amount, the transaction reverts.',
      intermediate: 'Lower execution bound derived from quote and slippage.',
      expert: 'On-chain output floor.',
    },
    minHelpLevelToShow: 'intermediate',
    links: ['/exchange', '/advanced'],
  },
  'swap.routing': {
    title: 'Routing',
    bodyByLevel: {
      novice: 'Routing picks the liquidity path used for your swap. Different routes can change fees, execution quality, and failure risk.',
      intermediate: 'Selected execution path across available liquidity.',
      expert: 'Route graph selection for best execution.',
    },
    minHelpLevelToShow: 'expert',
    links: ['/exchange'],
  },
  'swap.approval': {
    title: 'Token Approval',
    bodyByLevel: {
      novice: 'Approvals let the exchange contract move your tokens for swaps. You must approve before trading an ERC-20 token.',
      intermediate: 'Allowance grant enabling contract-side token transfer.',
      expert: 'ERC-20 allowance prerequisite.',
    },
    minHelpLevelToShow: 'intermediate',
    links: ['/exchange'],
  },
  'pool.tokenPair': {
    title: 'Token Pair',
    bodyByLevel: {
      novice: 'Your selected pair determines who can trade the pool and how volatile it may be. Choose assets with clear market demand.',
      intermediate: 'Pair selection drives liquidity profile and expected volume.',
      expert: 'Pair composition defines pool demand surface.',
    },
    minHelpLevelToShow: 'novice',
    links: ['/advanced'],
  },
  'pool.initialPrice': {
    title: 'Initial Price',
    bodyByLevel: {
      novice: 'Initial price sets the first exchange rate in the pool. If mispriced, arbitrage can drain value from your initial liquidity.',
      intermediate: 'Starting price anchor for the newly created pool.',
      expert: 'Bootstrap price ratio.',
    },
    riskNoteByLevel: {
      novice: 'Double-check this value before creation. A bad starting ratio is costly and immediately exploited.',
      intermediate: 'Mispricing creates immediate arbitrage loss.',
      expert: 'Incorrect bootstrap ratio is instantly arb’d.',
    },
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/advanced'],
  },
  'pool.feeTier': {
    title: 'Fee Tier',
    bodyByLevel: {
      novice: 'Fee tier defines what traders pay and what LPs earn per swap. Higher fees protect LPs in volatile markets but can reduce volume.',
      intermediate: 'Swap fee level balancing volume and LP revenue.',
      expert: 'Per-swap fee bps.',
    },
    minHelpLevelToShow: 'intermediate',
    links: ['/advanced'],
  },
  'pool.poolShare': {
    title: 'Pool Share',
    bodyByLevel: {
      novice: 'Pool share is your ownership percentage of total liquidity. It controls how much fee income and inventory exposure you receive.',
      intermediate: 'Your proportional claim on fees and reserves.',
      expert: 'LP ownership fraction.',
    },
    minHelpLevelToShow: 'intermediate',
    links: ['/advanced'],
  },
  'orbital.concentration': {
    title: 'Concentration Power',
    bodyByLevel: {
      novice: 'Higher concentration focuses liquidity near equilibrium for better capital efficiency, but it needs tighter monitoring when markets move.',
      intermediate: 'Controls how tightly liquidity is distributed around equilibrium.',
      expert: 'Liquidity concentration exponent.',
    },
    learnMoreByLevel: {
      novice: 'Use lower concentration for volatile pairs and higher concentration for tightly correlated assets.',
      intermediate: 'High concentration is efficient but less forgiving in drift.',
      expert: 'Tune based on expected variance.',
    },
    isProductSpecific: true,
    expertVisible: true,
    expertLearnMore: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/advanced'],
  },
  'orbital.invariant': {
    title: 'Orbital Invariant',
    bodyByLevel: {
      novice: 'Orbital pools use a power-mean invariant, not a constant-product formula. Behavior under volatility depends on your concentration setting.',
      intermediate: 'Swap math is governed by Orbital power-mean invariants.',
      expert: 'Power-mean invariant curve.',
    },
    isProductSpecific: true,
    expertVisible: true,
    expertLearnMore: true,
    minHelpLevelToShow: 'expert',
    links: ['/advanced'],
  },
  'orbital.slippage': {
    title: 'Orbital Slippage',
    bodyByLevel: {
      novice: 'Slippage protection sets your minimum acceptable output for Orbital swaps. Keep it tight during volatile periods.',
      intermediate: 'Tolerance bound applied to Orbital quote execution.',
      expert: 'Orbital execution tolerance.',
    },
    isProductSpecific: true,
    expertVisible: true,
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/advanced'],
  },
  'orbital.priceImpact': {
    title: 'Orbital Price Impact',
    bodyByLevel: {
      novice: 'This estimates how much your trade shifts Orbital pool pricing at current depth. Large shifts usually mean worse fills.',
      intermediate: 'Estimated Orbital curve displacement from this trade size.',
      expert: 'Orbital curve impact estimate.',
    },
    isProductSpecific: true,
    expertVisible: true,
    riskCritical: true,
    minHelpLevelToShow: 'intermediate',
    links: ['/advanced'],
  },
  'orbital.quoteRefresh': {
    title: 'Quote Refresh',
    bodyByLevel: {
      novice: 'Quotes refresh on a timer to reflect pool movement. Recheck output right before signing.',
      intermediate: 'Timed quote refresh keeps execution preview current.',
      expert: 'Periodic quote revalidation.',
    },
    isProductSpecific: true,
    expertVisible: true,
    minHelpLevelToShow: 'expert',
    links: ['/advanced'],
  },
} as const satisfies Record<string, TooltipDefinition>;

export type TooltipId = keyof typeof TOOLTIP_REGISTRY;

function resolveLevelTextByPreference(
  level: HelpLevel,
  source: LevelBody | LevelOptional,
): string | undefined {
  if (level === 'novice') {
    return source.novice;
  }
  if (level === 'intermediate') {
    return source.intermediate ?? source.novice;
  }
  return source.expert ?? source.intermediate ?? source.novice;
}

export function getTooltipDefinition(tooltipId: TooltipId): TooltipDefinition {
  return TOOLTIP_REGISTRY[tooltipId];
}

export function shouldShowTooltipForHelpLevel(
  tooltip: TooltipDefinition,
  helpLevel: HelpLevel,
): boolean {
  const minLevel = tooltip.minHelpLevelToShow ?? 'novice';
  const userOrder = HELP_LEVEL_ORDER[helpLevel];
  const minOrder = HELP_LEVEL_ORDER[minLevel];
  const baseVisible = minOrder >= userOrder;

  if (helpLevel !== 'expert') {
    return baseVisible;
  }

  if (baseVisible) {
    return true;
  }

  return tooltip.isProductSpecific === true && tooltip.expertVisible === true;
}

export function getTooltipBody(
  tooltip: TooltipDefinition,
  helpLevel: HelpLevel,
): string {
  return resolveLevelTextByPreference(helpLevel, tooltip.bodyByLevel) ?? tooltip.bodyByLevel.novice;
}

export function getTooltipRiskNote(
  tooltip: TooltipDefinition,
  helpLevel: HelpLevel,
): string | undefined {
  if (!tooltip.riskNoteByLevel) return undefined;
  return resolveLevelTextByPreference(helpLevel, tooltip.riskNoteByLevel);
}

export function shouldShowLearnMore(
  tooltip: TooltipDefinition,
  helpLevel: HelpLevel,
): boolean {
  if (!tooltip.learnMoreByLevel) return false;
  if (helpLevel !== 'expert') return true;
  return (
    tooltip.riskCritical === true ||
    (tooltip.isProductSpecific === true && tooltip.expertLearnMore === true)
  );
}

export function getTooltipLearnMore(
  tooltip: TooltipDefinition,
  helpLevel: HelpLevel,
): string | undefined {
  if (!tooltip.learnMoreByLevel) return undefined;
  return resolveLevelTextByPreference(helpLevel, tooltip.learnMoreByLevel);
}

export function getValidatedTooltipLinks(tooltip: TooltipDefinition): string[] {
  if (!tooltip.links) return [];
  return tooltip.links.filter((route) => VALID_INTERNAL_HELP_ROUTES.has(route));
}
