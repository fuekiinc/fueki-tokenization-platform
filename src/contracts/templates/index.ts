import type {
  ContractTemplate,
  TemplateCategory,
} from '../../types/contractDeployer';

// ---------------------------------------------------------------------------
// ABI imports
// ---------------------------------------------------------------------------
import { FixedTokenABI } from './abis/simple-token';
import { VotingTokenABI } from './abis/voting-token';
import { AntiBotERC20ABI } from './abis/antibot-erc20';
import { BuybackBabyTokenABI } from './abis/buyback-baby-token';
import { SoulboundNFTABI } from './abis/soulbound-nft';
import { SimpleERC1155ABI } from './abis/simple-multi-nft';
import { SingleStakingABI } from './abis/simple-staking';
import { StakingABI } from './abis/token-staking';
import { NFTStakingPerTokenABI } from './abis/nft-staking-rewards';
import { LinearVestingABI } from './abis/linear-vesting';
import { DutchAuctionABI } from './abis/dutch-auction';
import { PresaleABI } from './abis/presale';
import { EscrowWithAgentABI } from './abis/escrow-agent';
import { EscrowABI } from './abis/escrow-dual';
import { PaymentSplitterABI } from './abis/royalty-splitter';
import { LotteryABI } from './abis/lottery';

// ---------------------------------------------------------------------------
// Bytecode import
// ---------------------------------------------------------------------------
import { TEMPLATE_BYTECODES } from './bytecodes';

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export const TEMPLATES: ContractTemplate[] = [
  // =========================================================================
  // TOKENS
  // =========================================================================
  {
    id: 'simple-token',
    name: 'Fixed Token',
    description:
      'Simple ERC20 token with a fixed supply. No minting function.',
    longDescription:
      'Deploy a standard ERC-20 token with a fixed total supply minted entirely to the deployer on creation. ' +
      'This is the simplest token template available -- there is no owner, no mint function, and no special ' +
      'permissions. The full supply is sent to the deployer wallet at deployment time. Ideal for community ' +
      'tokens, meme coins, or any use case where the entire supply should exist from day one with no ' +
      'inflationary mechanics.',
    category: 'tokens',
    tags: ['erc20', 'fixed-supply', 'token', 'simple'],
    abi: FixedTokenABI,
    bytecode: TEMPLATE_BYTECODES['simple-token'],
    icon: 'Coins',
    constructorParams: [
      {
        name: 'name',
        type: 'string',
        label: 'Token Name',
        description: 'The full name of the token (e.g. "Fueki Token").',
        placeholder: 'Fueki Token',
      },
      {
        name: 'symbol',
        type: 'string',
        label: 'Token Symbol',
        description:
          'The ticker symbol for the token (e.g. "FUEKI"). Typically 3-5 uppercase characters.',
        placeholder: 'FUEKI',
      },
      {
        name: 'totalSupply',
        type: 'uint256',
        label: 'Total Supply',
        description:
          'The total number of tokens to mint. This is the final supply -- no more can ever be created.',
        placeholder: '1000000',
        decimals: 18,
      },
    ],
  },
  {
    id: 'voting-token',
    name: 'Voting Token',
    description:
      'ERC20 token with built-in governance voting capabilities.',
    longDescription:
      'An ERC-20 token extended with OpenZeppelin Votes, enabling on-chain governance participation. ' +
      'Token holders can delegate their voting power to themselves or other addresses, and votes are ' +
      'checkpointed so that historical balances can be queried for snapshot-based proposals. Compatible ' +
      'with Governor contracts and any governance framework that relies on ERC20Votes. Perfect for DAOs, ' +
      'protocol governance tokens, and community-driven projects that need trustless on-chain voting.',
    category: 'tokens',
    tags: ['erc20', 'governance', 'voting', 'dao', 'delegation'],
    abi: VotingTokenABI,
    bytecode: TEMPLATE_BYTECODES['voting-token'],
    icon: 'Vote',
    constructorParams: [
      {
        name: 'name',
        type: 'string',
        label: 'Token Name',
        description: 'The full name of the governance token.',
        placeholder: 'Fueki Governance',
      },
      {
        name: 'symbol',
        type: 'string',
        label: 'Token Symbol',
        description: 'The ticker symbol (e.g. "vFUEKI").',
        placeholder: 'vFUEKI',
      },
      {
        name: 'totalSupply',
        type: 'uint256',
        label: 'Total Supply',
        description:
          'Total number of voting tokens to mint to the deployer.',
        placeholder: '10000000',
        decimals: 18,
      },
    ],
  },
  {
    id: 'antibot-erc20',
    name: 'Anti-Bot Token',
    description:
      'ERC20 token with same-block transfer protection against bots.',
    longDescription:
      'An ERC-20 token that includes built-in anti-bot mechanics to prevent sandwich attacks and ' +
      'front-running during launch. The contract tracks the block number of each address\'s first ' +
      'interaction and restricts multiple transfers within the same block. This effectively blocks ' +
      'common MEV bot strategies without requiring external anti-bot services. The token name and ' +
      'symbol are hardcoded in the contract. Ideal for fair launches where protecting early buyers ' +
      'from bot manipulation is a priority.',
    category: 'tokens',
    tags: ['erc20', 'anti-bot', 'mev-protection', 'fair-launch'],
    abi: AntiBotERC20ABI,
    bytecode: TEMPLATE_BYTECODES['antibot-erc20'],
    icon: 'ShieldAlert',
    constructorParams: [
      {
        name: 'name_',
        type: 'string',
        label: 'Token Name',
        description: 'The full name of the token (e.g. "Anti-Bot Token").',
        placeholder: 'Anti-Bot Token',
      },
      {
        name: 'symbol_',
        type: 'string',
        label: 'Token Symbol',
        description:
          'The ticker symbol for the token (e.g. "ABT"). Typically 3-5 uppercase characters.',
        placeholder: 'ABT',
      },
      {
        name: 'totalSupply_',
        type: 'uint256',
        label: 'Total Supply',
        description:
          'The total number of tokens to mint. The full supply is sent to the deployer at creation.',
        placeholder: '1000000',
        decimals: 18,
      },
    ],
  },
  {
    id: 'buyback-baby-token',
    name: 'Buyback Baby Token',
    description:
      'Feature-rich token with auto-buyback, reflection rewards, and liquidity generation.',
    longDescription:
      'A fully-featured tokenomics token that combines multiple DeFi mechanics into a single contract. ' +
      'On every transfer, configurable fees are collected and distributed across five channels: ' +
      'liquidity generation (auto-adds to the DEX pool), buyback and burn (automatically purchases and ' +
      'burns tokens to create deflationary pressure), reflection rewards (distributes a reward token to ' +
      'holders proportionally), marketing wallet allocation, and a service fee. The contract integrates ' +
      'with any Uniswap V2-compatible router for automatic swaps. Suitable for advanced tokenomics ' +
      'projects, buyback-driven tokens, and reflection reward ecosystems. The constructor is payable to ' +
      'fund initial liquidity.',
    category: 'tokens',
    tags: [
      'erc20',
      'buyback',
      'reflection',
      'liquidity',
      'tokenomics',
      'defi',
    ],
    abi: BuybackBabyTokenABI,
    bytecode: TEMPLATE_BYTECODES['buyback-baby-token'],
    icon: 'TrendingUp',
    payable: true,
    constructorParams: [
      {
        name: 'name_',
        type: 'string',
        label: 'Token Name',
        description: 'The full name of the token.',
        placeholder: 'Buyback Token',
      },
      {
        name: 'symbol_',
        type: 'string',
        label: 'Token Symbol',
        description: 'The ticker symbol.',
        placeholder: 'BBT',
      },
      {
        name: 'totalSupply_',
        type: 'uint256',
        label: 'Total Supply',
        description: 'Total number of tokens to create.',
        placeholder: '1000000000',
        decimals: 18,
      },
      {
        name: 'rewardToken_',
        type: 'address',
        label: 'Reward Token',
        description:
          'The ERC-20 token address distributed as reflection rewards to holders.',
        placeholder: '0x...',
      },
      {
        name: 'router_',
        type: 'address',
        label: 'DEX Router',
        description:
          'Uniswap V2-compatible router address for auto-swaps and liquidity.',
        placeholder: '0x...',
      },
      {
        name: 'feeSettings_',
        type: 'uint256[5]',
        label: 'Fee Settings',
        description:
          'Five fee percentages in basis points: [liquidity, buyback, reflection, marketing, service]. Each value is 0-10000 (100 = 1%).',
        placeholder: '300,300,200,100,100',
      },
      {
        name: 'serviceFeeReceiver_',
        type: 'address',
        label: 'Service Fee Receiver',
        description: 'Address that receives the service fee portion.',
        placeholder: '0x...',
      },
      {
        name: 'serviceFee_',
        type: 'uint256',
        label: 'Service Fee',
        description: 'One-time service fee sent on deployment (in wei).',
        placeholder: '0',
      },
    ],
  },

  // =========================================================================
  // NFTS
  // =========================================================================
  {
    id: 'soulbound-nft',
    name: 'Soulbound NFT',
    description:
      'Non-transferable NFT (SBT) for credentials, certificates, and identity.',
    longDescription:
      'A Soulbound Token (SBT) implementation based on ERC-721 with transfers permanently disabled. ' +
      'Once minted to a wallet, the token cannot be transferred, sold, or moved to another address. ' +
      'This makes it ideal for on-chain credentials such as course completion certificates, KYC ' +
      'attestations, membership badges, skill verifications, and proof-of-attendance tokens. The ' +
      'contract supports a configurable max supply and a shared metadata URI for all tokens. Only the ' +
      'contract owner can mint new tokens.',
    category: 'nfts',
    tags: ['erc721', 'soulbound', 'sbt', 'credential', 'non-transferable'],
    abi: SoulboundNFTABI,
    bytecode: TEMPLATE_BYTECODES['soulbound-nft'],
    icon: 'Lock',
    constructorParams: [
      {
        name: '_name',
        type: 'string',
        label: 'Collection Name',
        description: 'The name of the NFT collection.',
        placeholder: 'Fueki Credentials',
      },
      {
        name: '_symbol',
        type: 'string',
        label: 'Collection Symbol',
        description: 'Short symbol for the collection.',
        placeholder: 'FCRED',
      },
      {
        name: '_uri',
        type: 'string',
        label: 'Metadata URI',
        description:
          'Base URI for token metadata (e.g. IPFS gateway URL). Shared across all tokens.',
        placeholder: 'ipfs://Qm.../metadata.json',
      },
      {
        name: 'maxSupply',
        type: 'uint256',
        label: 'Max Supply',
        description:
          'Maximum number of tokens that can ever be minted. Set to 0 for unlimited.',
        placeholder: '1000',
      },
    ],
  },
  {
    id: 'simple-multi-nft',
    name: 'Multi-Collection NFT (ERC1155)',
    description:
      'ERC1155 multi-token standard for collections with owner minting.',
    longDescription:
      'An ERC-1155 multi-token contract that supports multiple token types within a single deployment. ' +
      'Unlike ERC-721 where each token is unique, ERC-1155 allows both fungible and non-fungible tokens ' +
      'to coexist in the same contract. The owner can mint any quantity of any token ID, making it ' +
      'perfect for game items (swords, potions, armor), membership tiers, event tickets, or any system ' +
      'that needs multiple distinct asset types. Gas-efficient batch transfers are supported natively. ' +
      'All tokens share a single URI pattern for metadata resolution.',
    category: 'nfts',
    tags: ['erc1155', 'multi-token', 'nft', 'gaming', 'batch'],
    abi: SimpleERC1155ABI,
    bytecode: TEMPLATE_BYTECODES['simple-multi-nft'],
    icon: 'Layers',
    constructorParams: [
      {
        name: '_uri',
        type: 'string',
        label: 'Metadata URI',
        description:
          'URI pattern for token metadata. Use {id} as a placeholder for the token ID (e.g. "https://api.example.com/token/{id}.json").',
        placeholder: 'https://api.example.com/token/{id}.json',
      },
    ],
  },

  // =========================================================================
  // STAKING & VESTING
  // =========================================================================
  {
    id: 'simple-staking',
    name: 'Simple Staking',
    description:
      'Multi-reward staking pool with permit support based on Curve MultiRewards.',
    longDescription:
      'A battle-tested staking contract based on the Curve/Synthetix MultiRewards pattern. Users stake ' +
      'a single token and earn rewards in one or more reward tokens simultaneously. The contract owner ' +
      'can add new reward tokens and set reward durations and rates at any time. Supports ERC-2612 ' +
      'permit for gasless approvals, allowing users to stake in a single transaction. Reward ' +
      'distribution is continuous and time-weighted, meaning rewards accrue every second proportional ' +
      'to each user\'s share of the pool. Ideal for DeFi protocols, liquidity mining programs, and ' +
      'token incentive campaigns.',
    category: 'staking',
    tags: ['staking', 'multi-reward', 'defi', 'yield', 'farming'],
    abi: SingleStakingABI,
    bytecode: TEMPLATE_BYTECODES['simple-staking'],
    icon: 'Landmark',
    constructorParams: [
      {
        name: '_stakingToken',
        type: 'address',
        label: 'Staking Token',
        description:
          'Address of the ERC-20 token that users will stake in the pool.',
        placeholder: '0x...',
      },
    ],
  },
  {
    id: 'token-staking',
    name: 'Token Staking with Vesting',
    description:
      'Staking pool with configurable duration, rewards, and built-in vesting.',
    longDescription:
      'A staking contract with a fixed staking period and built-in vesting for claimed rewards. Users ' +
      'stake tokens during the active staking window and earn rewards proportional to their stake. When ' +
      'the staking period ends, rewards are subject to a vesting schedule before they can be fully ' +
      'withdrawn. This prevents immediate sell pressure from reward distributions. The contract owner ' +
      'sets the staking duration (in blocks), the total reward fund, and the vesting period. Perfect ' +
      'for token launches that want to incentivize long-term holding, protocol reward programs, and ' +
      'yield farming with anti-dump protection.',
    category: 'staking',
    tags: ['staking', 'vesting', 'rewards', 'defi', 'lock'],
    abi: StakingABI,
    bytecode: TEMPLATE_BYTECODES['token-staking'],
    icon: 'Clock',
    constructorParams: [
      {
        name: 'oilerToken_',
        type: 'address',
        label: 'Staking/Reward Token',
        description:
          'Address of the ERC-20 token used for both staking and rewards.',
        placeholder: '0x...',
      },
      {
        name: 'stakingDurationInBlocks_',
        type: 'uint256',
        label: 'Staking Duration (blocks)',
        description:
          'How many blocks the staking period lasts. On Ethereum, ~7200 blocks per day.',
        placeholder: '50400',
      },
      {
        name: 'stakingFundAmount_',
        type: 'uint256',
        label: 'Reward Fund Amount',
        description:
          'Total tokens allocated as staking rewards. Must be pre-funded to the contract.',
        placeholder: '100000',
      },
      {
        name: 'vestingDuration_',
        type: 'uint256',
        label: 'Vesting Duration (seconds)',
        description:
          'Duration over which earned rewards vest linearly after the staking period ends.',
        placeholder: '2592000',
      },
      {
        name: 'owner_',
        type: 'address',
        label: 'Owner',
        description:
          'Address granted owner privileges to manage the staking contract.',
        placeholder: '0x...',
      },
    ],
  },
  {
    id: 'nft-staking-rewards',
    name: 'NFT Staking Rewards',
    description:
      'Stake NFTs to earn ERC20 token rewards at a fixed rate per NFT.',
    longDescription:
      'A staking contract that allows NFT holders to stake their ERC-721 tokens and earn ERC-20 ' +
      'rewards over time. Each staked NFT earns rewards at a fixed rate per time unit, incentivizing ' +
      'holders to lock their NFTs in the contract. Rewards are funded from a designated wallet that ' +
      'must approve the staking contract to distribute tokens. Users can stake multiple NFTs, claim ' +
      'accumulated rewards at any time, and unstake to retrieve their NFTs. Great for NFT collections ' +
      'that want to add utility, play-to-earn games, and projects looking to reward long-term holders.',
    category: 'staking',
    tags: ['nft', 'staking', 'erc721', 'rewards', 'erc20'],
    abi: NFTStakingPerTokenABI,
    bytecode: TEMPLATE_BYTECODES['nft-staking-rewards'],
    icon: 'Gift',
    constructorParams: [
      {
        name: 'nftAddress',
        type: 'address',
        label: 'NFT Collection',
        description: 'Address of the ERC-721 NFT collection that can be staked.',
        placeholder: '0x...',
      },
      {
        name: 'rewardTokenAddress',
        type: 'address',
        label: 'Reward Token',
        description:
          'Address of the ERC-20 token distributed as staking rewards.',
        placeholder: '0x...',
      },
      {
        name: 'rewardWalletAddress',
        type: 'address',
        label: 'Reward Wallet',
        description:
          'Wallet holding the reward tokens. Must approve this contract to spend reward tokens.',
        placeholder: '0x...',
      },
      {
        name: 'rewardRate',
        type: 'uint256',
        label: 'Reward Rate',
        description:
          'Reward tokens earned per NFT per time unit (in the token\'s smallest unit).',
        placeholder: '10',
      },
    ],
  },
  {
    id: 'linear-vesting',
    name: 'Linear Vesting',
    description:
      'Token vesting contract with linear schedule, cliff period, and batch vesting.',
    longDescription:
      'A token vesting contract that releases tokens linearly over a defined time window with an ' +
      'optional cliff period. The contract owner can create multiple vesting schedules for different ' +
      'beneficiaries, each with their own allocation. Tokens remain locked until the cliff period ' +
      'passes, after which they unlock continuously until the end date. Supports batch vesting ' +
      'creation for efficiently onboarding many recipients in a single transaction. Commonly used ' +
      'for team token allocations, investor vesting schedules, advisor grants, and any scenario ' +
      'requiring controlled token release over time.',
    category: 'staking',
    tags: ['vesting', 'linear', 'cliff', 'token-lock', 'team'],
    abi: LinearVestingABI,
    bytecode: TEMPLATE_BYTECODES['linear-vesting'],
    icon: 'Timer',
    constructorParams: [
      {
        name: '_token',
        type: 'address',
        label: 'Token Address',
        description: 'Address of the ERC-20 token to be vested.',
        placeholder: '0x...',
      },
      {
        name: '_start',
        type: 'uint256',
        label: 'Start Time',
        description:
          'Unix timestamp when the vesting period begins.',
        placeholder: '1700000000',
      },
      {
        name: '_end',
        type: 'uint256',
        label: 'End Time',
        description:
          'Unix timestamp when the vesting period ends and all tokens are fully unlocked.',
        placeholder: '1731536000',
      },
      {
        name: '_cliffDurationInSecs',
        type: 'uint256',
        label: 'Cliff Duration (seconds)',
        description:
          'Duration of the cliff period in seconds. No tokens are released before the cliff passes. Set to 0 for no cliff.',
        placeholder: '2592000',
      },
    ],
  },

  // =========================================================================
  // TRADING & SALES
  // =========================================================================
  {
    id: 'dutch-auction',
    name: 'Dutch Auction',
    description:
      'Descending-price auction for NFTs with configurable price decay.',
    longDescription:
      'A Dutch auction contract where the price starts high and decreases linearly over time until a ' +
      'buyer accepts the current price or the auction reaches its reserve price. This stateless contract ' +
      'does not require constructor parameters -- auctions are created via the createAuction() function, ' +
      'allowing multiple independent auctions from a single deployment. Each auction specifies the NFT, ' +
      'starting price, ending price, and duration. The price decays smoothly between the two bounds. ' +
      'Ideal for NFT drops, rare item sales, price discovery for unique assets, and any scenario where ' +
      'the market should determine fair value through a descending price mechanism.',
    category: 'trading',
    tags: ['auction', 'dutch', 'nft', 'sale', 'price-discovery'],
    abi: DutchAuctionABI,
    bytecode: TEMPLATE_BYTECODES['dutch-auction'],
    icon: 'Gavel',
    constructorParams: [],
  },
  {
    id: 'presale',
    name: 'Token Presale',
    description:
      'Presale contract with Chainlink price feed integration for token sales.',
    longDescription:
      'A token presale contract that accepts native currency (ETH/MATIC) and uses a Chainlink price ' +
      'feed oracle to determine the USD-equivalent price per token. This enables setting a stable ' +
      'dollar-denominated price while accepting volatile native currency payments. The contract owner ' +
      'configures the token price, sale limits, and timing. Buyers receive tokens immediately or after ' +
      'a configurable claim period. Integrates directly with Chainlink\'s decentralized oracle network ' +
      'for reliable, manipulation-resistant price data. Suitable for IDOs, token launches, and any ' +
      'project conducting a public or private token sale with USD-pegged pricing.',
    category: 'trading',
    tags: ['presale', 'ido', 'sale', 'chainlink', 'oracle'],
    abi: PresaleABI,
    bytecode: TEMPLATE_BYTECODES['presale'],
    icon: 'Rocket',
    constructorParams: [
      {
        name: '_token',
        type: 'address',
        label: 'Sale Token',
        description:
          'Address of the ERC-20 token being sold in the presale.',
        placeholder: '0x...',
      },
      {
        name: '_priceFeed',
        type: 'address',
        label: 'Chainlink Price Feed',
        description:
          'Chainlink price feed contract address (e.g. ETH/USD feed for the target chain).',
        placeholder: '0x...',
      },
    ],
  },

  // =========================================================================
  // UTILITY
  // =========================================================================
  {
    id: 'escrow-agent',
    name: 'Escrow with Agent',
    description:
      'Three-party escrow with buyer, seller, and agent. Supports dispute resolution.',
    longDescription:
      'A three-party escrow contract for trustless transactions between a buyer and seller, mediated ' +
      'by a neutral agent. The buyer deposits funds into escrow, and the agent can release funds to ' +
      'the seller upon successful delivery or refund the buyer in case of a dispute. The agent earns ' +
      'a configurable fee for their mediation service. This contract uses an init() function rather ' +
      'than constructor parameters, allowing the same deployment to be reused for multiple escrow ' +
      'arrangements. Perfect for freelance payments, P2P marketplace transactions, service agreements, ' +
      'and any deal where both parties want the security of a trusted intermediary without relying on ' +
      'a centralized platform.',
    category: 'utility',
    tags: ['escrow', 'agent', 'dispute', 'payment', 'p2p'],
    abi: EscrowWithAgentABI,
    bytecode: TEMPLATE_BYTECODES['escrow-agent'],
    icon: 'HandCoins',
    constructorParams: [
      {
        name: '_payer',
        type: 'address',
        label: 'Payer Address',
        description:
          'Wallet address of the buyer/payer who will deposit funds into escrow.',
        placeholder: '0x...',
      },
      {
        name: '_payee',
        type: 'address',
        label: 'Payee Address',
        description:
          'Wallet address of the seller/payee who will receive funds when the agent releases them.',
        placeholder: '0x...',
      },
      {
        name: '_agent',
        type: 'address',
        label: 'Agent Address',
        description:
          'Wallet address of the neutral third-party agent who decides whether to release funds to the payee or refund the payer.',
        placeholder: '0x...',
      },
      {
        name: '_amount',
        type: 'uint256',
        label: 'Escrow Amount',
        description:
          'The amount of ETH (in wei) to be held in escrow. The payer must deposit exactly this amount.',
        placeholder: '1000000000000000000',
        decimals: 18,
      },
    ],
  },
  {
    id: 'escrow-dual',
    name: 'ERC20 & ERC721 Escrow',
    description:
      'Multi-asset escrow supporting both ERC20 tokens and ERC721 NFTs.',
    longDescription:
      'A versatile escrow contract that can hold and manage both ERC-20 tokens and ERC-721 NFTs in ' +
      'the same escrow arrangement. This enables complex trades such as swapping an NFT for tokens, ' +
      'exchanging tokens for tokens, or any combination of fungible and non-fungible assets. The ' +
      'contract handles deposit tracking, approval verification, and atomic settlement to ensure ' +
      'both parties receive their assets simultaneously. No constructor parameters are needed -- ' +
      'escrow deals are created through function calls after deployment. Ideal for OTC trades, NFT ' +
      'marketplaces, cross-asset swaps, and peer-to-peer trading of mixed asset types.',
    category: 'utility',
    tags: ['escrow', 'erc20', 'erc721', 'multi-asset', 'swap'],
    abi: EscrowABI,
    bytecode: TEMPLATE_BYTECODES['escrow-dual'],
    icon: 'ScrollText',
    constructorParams: [
      {
        name: 'fee_',
        type: 'uint256',
        label: 'Deposit Fee',
        description:
          'Fee charged per asset on each deposit (in ETH). For example, 0.001 ETH means depositing 5 assets costs 0.005 ETH.',
        placeholder: '0.001',
        decimals: 18,
      },
      {
        name: 'maxAssets_',
        type: 'uint256',
        label: 'Max Unclaimed Assets',
        description:
          'Maximum number of unclaimed assets a single recipient can have at once. Prevents gas-intensive loops. Recommended: 10-50.',
        placeholder: '10',
      },
    ],
  },
  {
    id: 'royalty-splitter',
    name: 'Payment Splitter',
    description:
      'Split incoming payments proportionally among multiple recipients.',
    longDescription:
      'A payment splitting contract that automatically distributes incoming ETH and ERC-20 payments ' +
      'among a predefined list of recipients according to their assigned shares. Each payee is assigned ' +
      'a number of shares, and payments are split proportionally (e.g. if Alice has 60 shares and Bob ' +
      'has 40 shares, Alice receives 60% and Bob receives 40% of every payment). Recipients can claim ' +
      'their accumulated balance at any time. Supports both native currency (ETH) and any ERC-20 token. ' +
      'Commonly used for royalty distribution, revenue sharing among team members, multi-sig treasury ' +
      'splits, and automated payment distribution for DAOs or partnerships.',
    category: 'utility',
    tags: ['splitter', 'royalty', 'payment', 'revenue-share', 'dao'],
    abi: PaymentSplitterABI,
    bytecode: TEMPLATE_BYTECODES['royalty-splitter'],
    icon: 'Split',
    constructorParams: [
      {
        name: 'payees',
        type: 'address[]',
        label: 'Payees',
        description:
          'Comma-separated list of recipient addresses that will receive payments.',
        placeholder: '0xAlice..., 0xBob..., 0xCarol...',
      },
      {
        name: 'shares_',
        type: 'uint256[]',
        label: 'Shares',
        description:
          'Comma-separated list of share amounts corresponding to each payee. The ratio determines payout percentages.',
        placeholder: '50, 30, 20',
      },
    ],
  },
  {
    id: 'lottery',
    name: 'Lottery',
    description:
      'Lottery contract with ticket purchases and random winner selection.',
    longDescription:
      'A decentralized lottery contract where users purchase tickets with native currency for a chance ' +
      'to win the accumulated prize pool. The contract uses a verifiable random function integration ' +
      'through a Midpoint oracle to select winners fairly and transparently. The lottery operator can ' +
      'configure ticket prices, maximum tickets per round, and round duration. When a round ends, the ' +
      'oracle callback selects a random winner who can claim the entire prize pool. Multiple rounds ' +
      'can be run sequentially from a single deployment. Suitable for community fundraising, gamified ' +
      'token distribution, and entertainment dApps that need provably fair random selection.',
    category: 'utility',
    tags: ['lottery', 'random', 'oracle', 'game', 'prize'],
    abi: LotteryABI,
    bytecode: TEMPLATE_BYTECODES['lottery'],
    icon: 'Ticket',
    constructorParams: [
      {
        name: '_midpointID',
        type: 'uint64',
        label: 'Midpoint ID',
        description:
          'The Midpoint oracle function ID used for random number generation.',
        placeholder: '1',
      },
      {
        name: '_startpointAddress',
        type: 'address',
        label: 'Startpoint Address',
        description:
          'Address of the Midpoint Startpoint contract on the target chain.',
        placeholder: '0x...',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Look up a template by its unique ID.
 * Returns `undefined` if no template matches.
 */
export function getTemplateById(id: string): ContractTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Return all templates belonging to a given category.
 */
export function getTemplatesByCategory(
  category: TemplateCategory,
): ContractTemplate[] {
  return TEMPLATES.filter((t) => t.category === category);
}

/**
 * Full-text search across template name, description, tags, and category.
 * The query is case-insensitive and matches partial words.
 */
export function searchTemplates(query: string): ContractTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return TEMPLATES;

  return TEMPLATES.filter((t) => {
    const haystack = [
      t.name,
      t.description,
      t.longDescription,
      t.category,
      ...t.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
