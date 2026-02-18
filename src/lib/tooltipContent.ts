// ---------------------------------------------------------------------------
// Centralized tooltip content for the Fueki Tokenization Platform
//
// All user-facing explanations for unfamiliar concepts live here so they can
// be updated in one place and stay consistent across the application.
//
// Tone: professional but approachable. Avoid jargon where possible; when
// technical terms are necessary, explain them inline.
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
  tvl: 'Total Value Locked \u2014 the total amount of assets deposited in this liquidity pool. Higher TVL generally means better price stability and lower slippage.',
  liquidityPool:
    'A pool of tokens locked in a smart contract that enables decentralized trading. Liquidity providers earn fees from trades.',
  impermanentLoss:
    'A temporary loss that occurs when the price ratio of pooled tokens changes compared to when you deposited. The loss is only realized if you withdraw at the changed ratio. For stablecoin pairs, impermanent loss is typically minimal.',
  apr: 'Annual Percentage Rate \u2014 the projected yearly return from providing liquidity, based on recent trading volume and fees. APR does not account for compounding.',

  // Mint concepts
  tokenize:
    'Convert a real-world document or asset into a blockchain token that can be traded and tracked.',
  burn: 'Permanently destroy tokens, reducing the total supply. This is typically done when redeeming the underlying asset.',
  mintAmount:
    'The number of tokens to create. Each token represents a fractional share of the underlying asset. The total cannot exceed the document value.',

  // Portfolio concepts
  unrealizedGain:
    'The profit or loss on your current holdings that would be realized if you sold now. This value changes as market prices fluctuate.',
  costBasis:
    'The original purchase price of your assets, used to calculate gains and losses. Minted tokens have a cost basis of zero.',
  portfolioValue:
    'The combined dollar value of all tokenized assets currently held in your wallet.',
  totalAssets:
    'The total number of distinct wrapped asset tokens you own.',
  totalLocked:
    'The aggregate token balance across all your wrapped assets.',
  documentTypes:
    'The number of unique document formats (JSON, CSV, XML, etc.) backing your tokenized assets.',

  // DeFi / Blockchain concepts
  gasEstimate:
    'The estimated network fee for processing this transaction on the blockchain. Gas fees vary based on network congestion.',
  gasPrice:
    'The price per unit of computation on the blockchain. When the network is busy, gas prices increase. You can wait for lower gas to save on fees.',
  walletAddress:
    'Your unique blockchain address that identifies your account. Share this to receive tokens.',
  blockExplorer:
    'A website that lets you view all transactions and activity on the blockchain in real time.',
  kycStatus:
    'Know Your Customer \u2014 identity verification required for regulatory compliance before trading security tokens.',
  lockupPeriod:
    'A time period during which your tokens cannot be transferred or sold. Lockup periods are often required for security tokens to comply with regulations.',
  transferRestriction:
    'Rules that limit who can send or receive a security token. These restrictions ensure compliance with securities laws and may include investor accreditation checks.',
  dividendDistribution:
    'Periodic payments made to token holders from the revenue or profits of the underlying asset. Dividends are distributed proportionally based on your token balance.',
  tokenSupply:
    'The total number of tokens that exist for a given asset. This is fixed at creation for wrapped assets, but security tokens may allow additional minting.',
  smartContract:
    'A self-executing program stored on the blockchain that automatically enforces the rules of a transaction without requiring a middleman.',
  nonce:
    'A sequential number assigned to each transaction from your wallet. If a transaction gets stuck, you can replace it by sending a new one with the same nonce.',
} as const;

export type TooltipKey = keyof typeof TOOLTIPS;
