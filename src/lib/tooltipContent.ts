// ---------------------------------------------------------------------------
// Centralized tooltip content for the Fueki Tokenization Platform
//
// All user-facing explanations for unfamiliar concepts live here so they can
// be updated in one place and stay consistent across the application.
// ---------------------------------------------------------------------------

export const TOOLTIPS = {
  // Asset concepts
  wrappedAsset:
    'A wrapped asset is a tokenized representation of a real-world document or asset on the blockchain. It can be traded, transferred, and tracked with full transparency.',
  documentHash:
    "A cryptographic fingerprint of the original document. This proves the document hasn't been tampered with since it was tokenized.",
  securityToken:
    'A digital token that represents ownership of a real-world asset, compliant with securities regulations.',

  // Trading concepts
  orderBook:
    'A real-time list of buy and sell orders for a specific asset, organized by price level.',
  limitOrder:
    'An order to buy or sell at a specific price or better. It will only execute when the market reaches your price.',
  marketOrder:
    'An order that executes immediately at the best available price.',
  slippage:
    'The difference between the expected price and the actual execution price. Higher slippage tolerance means your trade is more likely to execute but may get a worse price.',
  priceImpact:
    'How much your trade will move the market price. Larger trades have higher price impact.',

  // AMM/Pool concepts
  tvl: 'Total Value Locked \u2014 the total amount of assets deposited in this liquidity pool.',
  liquidityPool:
    'A pool of tokens locked in a smart contract that enables decentralized trading. Liquidity providers earn fees from trades.',
  impermanentLoss:
    'A temporary loss that occurs when the price ratio of pooled tokens changes. The loss becomes permanent only if you withdraw at the changed ratio.',
  apr: 'Annual Percentage Rate \u2014 the projected yearly return from providing liquidity, based on recent trading volume and fees.',

  // Mint concepts
  tokenize:
    'Convert a real-world document or asset into a blockchain token that can be traded and tracked.',
  burn: 'Permanently destroy tokens, reducing the total supply. This is typically done when redeeming the underlying asset.',
  mintAmount:
    'The number of tokens to create. Each token represents a fractional share of the underlying asset.',

  // Portfolio concepts
  unrealizedGain:
    'The profit or loss on your current holdings that would be realized if you sold now.',
  costBasis:
    'The original purchase price of your assets, used to calculate gains and losses.',
  portfolioValue:
    'The combined dollar value of all tokenized assets currently held in your wallet.',
  totalAssets:
    'The total number of distinct wrapped asset tokens you own.',
  totalLocked:
    'The aggregate token balance across all your wrapped assets.',
  documentTypes:
    'The number of unique document formats (JSON, CSV, XML, etc.) backing your tokenized assets.',

  // General
  gasEstimate:
    'The estimated network fee for processing this transaction on the blockchain.',
  walletAddress:
    'Your unique blockchain address that identifies your account. Share this to receive tokens.',
  blockExplorer:
    'A website that lets you view all transactions and activity on the blockchain.',
  kycStatus:
    'Know Your Customer \u2014 identity verification required for regulatory compliance before trading security tokens.',
} as const;

export type TooltipKey = keyof typeof TOOLTIPS;
