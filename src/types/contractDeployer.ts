/** Template category for organizing contract templates. */
export type TemplateCategory =
  | 'tokens'
  | 'nfts'
  | 'staking'
  | 'trading'
  | 'utility';

export type ContractDeploymentTemplateType =
  | 'ERC20'
  | 'ERC721'
  | 'ERC1155'
  | 'ERC1404'
  | 'STAKING'
  | 'AUCTION'
  | 'ESCROW'
  | 'SPLITTER'
  | 'LOTTERY'
  | 'CUSTOM';

/** Solidity types used in constructor parameters. */
export type SolidityType =
  | 'address'
  | 'uint256'
  | 'uint64'
  | 'string'
  | 'bool'
  | 'bytes32'
  | 'address[]'
  | 'uint256[]'
  | 'uint256[5]';

/** Constructor parameter definition for a contract template. */
export interface ConstructorParam {
  /** Parameter name as it appears in the Solidity source. */
  name: string;
  /** Solidity type of the parameter. */
  type: SolidityType;
  /** Human-readable label for display. */
  label: string;
  /** Description of the parameter's purpose. */
  description: string;
  /** Placeholder text for the input field. */
  placeholder: string;
  /** Decimal precision for uint256 parameters (e.g. 18 for ERC-20 tokens). */
  decimals?: number;
  /** Whether the parameter is required. Defaults to true. */
  required?: boolean;
}

/** A deployable smart contract template. */
export interface ContractTemplate {
  /** Unique template identifier (URL-safe slug). */
  id: string;
  /** Human-readable contract name. */
  name: string;
  /** Short description (1-2 sentences). */
  description: string;
  /** Longer description for the detail view. */
  longDescription: string;
  /** Template category. */
  category: TemplateCategory;
  /** Searchable tags. */
  tags: string[];
  /** ABI array from compiled artifact. */
  abi: readonly Record<string, unknown>[];
  /** Deployable bytecode (hex string with 0x prefix). */
  bytecode: string;
  /** Constructor parameter definitions. Empty array if no constructor params. */
  constructorParams: ConstructorParam[];
  /** Lucide icon name for display. */
  icon: string;
  /** Whether the constructor is payable. */
  payable?: boolean;
}

/** Deployment record stored in localStorage and optionally in the backend DB. */
export interface DeploymentRecord {
  /** Unique ID (uuid v4). */
  id: string;
  /** Template ID that was deployed. */
  templateId: string;
  /** Template name at time of deployment. */
  templateName: string;
  /** Contract display name persisted in the backend record. */
  contractName?: string;
  /** Normalized template/deployment type. */
  templateType?: ContractDeploymentTemplateType;
  /** Deployed contract address. */
  contractAddress: string;
  /** Address of the deployer. */
  deployerAddress: string;
  /** Normalized wallet address used for backend history filtering. */
  walletAddress?: string;
  /** Chain ID the contract was deployed on. */
  chainId: number;
  /** Deployment transaction hash. */
  txHash: string;
  /** Serialized constructor arguments as key-value pairs. */
  constructorArgs: Record<string, unknown>;
  /** ABI array for contract interaction. */
  abi: readonly Record<string, unknown>[];
  /** Optional source code persisted for custom/AI-generated contracts. */
  sourceCode?: string | null;
  /** Optional compiler warnings captured during deployment preparation. */
  compilationWarnings?: string[] | null;
  /** Block number of the deployment. */
  blockNumber?: number;
  /** Gas used for deployment. */
  gasUsed?: string;
  /** Deployment timestamp (ISO 8601). */
  deployedAt: string;
  /** Backend record creation timestamp (ISO 8601). */
  createdAt?: string;
  /** Backend record update timestamp (ISO 8601). */
  updatedAt?: string;
}

/** Parsed ABI function for the interaction page. */
export interface ABIFunction {
  /** Function name. */
  name: string;
  /** Solidity state mutability. */
  stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
  /** Input parameters. */
  inputs: ABIParam[];
  /** Output parameters. */
  outputs: ABIParam[];
}

/** Parsed ABI event for the interaction page. */
export interface ABIEvent {
  /** Event name. */
  name: string;
  /** Event parameters. */
  inputs: ABIParam[];
}

/** ABI parameter definition. */
export interface ABIParam {
  /** Parameter name. */
  name: string;
  /** Solidity type. */
  type: string;
  /** Whether the parameter is indexed (events only). */
  indexed?: boolean;
  /** Tuple components for struct types. */
  components?: ABIParam[];
}

/** Gas estimation result. */
export interface GasEstimate {
  /** Raw gas units. */
  gasUnits: string;
  /** Gas cost in native currency (ETH/MATIC/etc). */
  gasCostNative: string;
  /** Gas cost in USD (null if price unavailable). */
  gasCostUsd: string | null;
}

/** Wizard step identifiers. */
export type DeployWizardStep = 'configure' | 'review' | 'success';
