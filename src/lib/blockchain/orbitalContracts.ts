/**
 * Blockchain contract interaction layer for the Orbital AMM.
 *
 * Provides a typed service class wrapping ethers.js calls for OrbitalFactory,
 * OrbitalRouter, and individual OrbitalPool contracts.
 *
 * All view functions use the RPC cache for reduced round-trips:
 *   - Pool metadata (name, symbol, tokens, concentration): TTL_METADATA (300 s)
 *   - Pool reserves, invariant, spot price: TTL_POOL (60 s)
 *   - Token balances, allowances: TTL_BALANCE (30 s)
 *
 * All write functions invalidate relevant cache entries after transaction
 * submission and use the executeWrite pattern with gas estimation.
 *
 * Multi-property reads are batched via Multicall3 to minimise RPC calls.
 */

import { ethers } from 'ethers';
import { OrbitalFactoryABI } from '../../contracts/abis/OrbitalFactory.ts';
import { OrbitalRouterABI } from '../../contracts/abis/OrbitalRouter.ts';
import { OrbitalPoolABI } from '../../contracts/abis/OrbitalPool.ts';
import { WrappedAssetABI } from '../../contracts/abis/WrappedAsset.ts';
import { getNetworkConfig } from '../../contracts/addresses';
import { multicallSameTarget } from './multicall.ts';
import { parseContractError } from './contracts.ts';
import {
  getCached,
  setCache,
  invalidateCache,
  invalidatePoolCache,
  TTL_BALANCE,
  TTL_POOL,
  TTL_METADATA,
} from './rpcCache.ts';
import logger from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrbitalPoolInfo {
  address: string;
  name: string;
  symbol: string;
  tokens: string[];
  reserves: bigint[];
  concentration: number;
  swapFeeBps: bigint;
  totalSupply: bigint;
  invariant: bigint;
}

export interface OrbitalTokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OrbitalContractService {
  private provider: ethers.BrowserProvider;
  private chainId: number;

  constructor(provider: ethers.BrowserProvider, chainId: number) {
    this.provider = provider;
    this.chainId = chainId;
  }

  async getSigner(): Promise<ethers.Signer> {
    return this.provider.getSigner();
  }

  // -----------------------------------------------------------------------
  // Contract accessors
  // -----------------------------------------------------------------------

  getFactoryContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.orbitalFactoryAddress) {
      throw new Error(`OrbitalFactory not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.orbitalFactoryAddress,
      OrbitalFactoryABI,
      signerOrProvider || this.provider,
    );
  }

  getRouterContract(
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.orbitalRouterAddress) {
      throw new Error(`OrbitalRouter not deployed on chain ${this.chainId}`);
    }
    return new ethers.Contract(
      config.orbitalRouterAddress,
      OrbitalRouterABI,
      signerOrProvider || this.provider,
    );
  }

  getPoolContract(
    poolAddress: string,
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    this.validateAddress(poolAddress, 'pool');
    return new ethers.Contract(
      poolAddress,
      OrbitalPoolABI,
      signerOrProvider || this.provider,
    );
  }

  getTokenContract(
    tokenAddress: string,
    signerOrProvider?: ethers.Signer | ethers.Provider,
  ): ethers.Contract {
    this.validateAddress(tokenAddress, 'token');
    return new ethers.Contract(
      tokenAddress,
      WrappedAssetABI,
      signerOrProvider || this.provider,
    );
  }

  // -----------------------------------------------------------------------
  // Factory read operations
  // -----------------------------------------------------------------------

  /** Retrieve all pool addresses from the factory. */
  async getAllPools(): Promise<string[]> {
    const cacheKey = `orbital:factory:allPools`;
    const cached = getCached<string[]>(cacheKey);
    if (cached) return cached;

    const factory = this.getFactoryContract();
    try {
      const result: string[] = await factory.getAllPools();
      setCache(cacheKey, result, TTL_POOL);
      return result;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch pool list: ${parseContractError(error)}`);
    }
  }

  /** Retrieve the total number of pools created. */
  async getTotalPools(): Promise<bigint> {
    const cacheKey = `orbital:factory:totalPools`;
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;

    const factory = this.getFactoryContract();
    try {
      const result: bigint = await factory.totalPools();
      setCache(cacheKey, result, TTL_POOL);
      return result;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch pool count: ${parseContractError(error)}`);
    }
  }

  /** Retrieve all pool addresses that include a specific token. */
  async getPoolsForToken(token: string): Promise<string[]> {
    this.validateAddress(token, 'token');
    const cacheKey = `orbital:factory:poolsForToken:${token}`;
    const cached = getCached<string[]>(cacheKey);
    if (cached) return cached;

    const factory = this.getFactoryContract();
    try {
      const result: string[] = await factory.getPoolsForToken(token);
      setCache(cacheKey, result, TTL_POOL);
      return result;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch pools for token: ${parseContractError(error)}`);
    }
  }

  /** Look up the pool address for a given token set and concentration. */
  async getPool(tokens: string[], concentration: number): Promise<string> {
    const factory = this.getFactoryContract();
    try {
      return await factory.getPool(tokens, concentration);
    } catch (error: unknown) {
      throw new Error(`Failed to look up pool address: ${parseContractError(error)}`);
    }
  }

  // -----------------------------------------------------------------------
  // Pool read operations (with Multicall3 batching and caching)
  // -----------------------------------------------------------------------

  /**
   * Retrieve full pool information in a single RPC call via Multicall3.
   * Metadata fields (name, symbol, tokens, concentration, swapFeeBps) are
   * cached at TTL_METADATA. Dynamic fields (reserves, totalSupply, invariant)
   * are cached at TTL_POOL.
   */
  async getPoolInfo(poolAddress: string): Promise<OrbitalPoolInfo> {
    this.validateAddress(poolAddress, 'pool');
    const cacheKey = `orbital:pool:${poolAddress}:info`;
    const cached = getCached<OrbitalPoolInfo>(cacheKey);
    if (cached) return cached;

    try {
      const results = await multicallSameTarget(
        this.provider,
        poolAddress,
        OrbitalPoolABI,
        [
          { functionName: 'name' },
          { functionName: 'symbol' },
          { functionName: 'getTokens' },
          { functionName: 'getReserves' },
          { functionName: 'concentration' },
          { functionName: 'swapFeeBps' },
          { functionName: 'totalSupply' },
          { functionName: 'getInvariant' },
        ],
      );

      const info: OrbitalPoolInfo = {
        address: poolAddress,
        name: results[0].success ? (results[0].data as string) : '',
        symbol: results[1].success ? (results[1].data as string) : '',
        tokens: results[2].success ? (results[2].data as string[]) : [],
        reserves: results[3].success
          ? (results[3].data as bigint[]).map((r: bigint) => BigInt(r))
          : [],
        concentration: results[4].success ? Number(results[4].data) : 0,
        swapFeeBps: results[5].success ? BigInt(results[5].data as bigint) : 0n,
        totalSupply: results[6].success ? BigInt(results[6].data as bigint) : 0n,
        invariant: results[7].success ? BigInt(results[7].data as bigint) : 0n,
      };

      setCache(cacheKey, info, TTL_POOL);
      return info;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch pool info: ${parseContractError(error)}`);
    }
  }

  /** Retrieve token reserves for a pool. */
  async getReserves(poolAddress: string): Promise<bigint[]> {
    this.validateAddress(poolAddress, 'pool');
    const cacheKey = `orbital:pool:${poolAddress}:reserves`;
    const cached = getCached<bigint[]>(cacheKey);
    if (cached) return cached;

    const pool = this.getPoolContract(poolAddress);
    try {
      const raw: bigint[] = await pool.getReserves();
      const reserves = raw.map((r) => BigInt(r));
      setCache(cacheKey, reserves, TTL_POOL);
      return reserves;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch reserves: ${parseContractError(error)}`);
    }
  }

  /** Retrieve the spot price between two tokens in a pool. */
  async getSpotPrice(
    poolAddress: string,
    tokenAIndex: number,
    tokenBIndex: number,
  ): Promise<bigint> {
    this.validateAddress(poolAddress, 'pool');
    const cacheKey = `orbital:pool:${poolAddress}:spotPrice:${tokenAIndex}:${tokenBIndex}`;
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;

    const pool = this.getPoolContract(poolAddress);
    try {
      const price = BigInt(await pool.getSpotPrice(tokenAIndex, tokenBIndex));
      setCache(cacheKey, price, TTL_POOL);
      return price;
    } catch (error: unknown) {
      throw new Error(`Failed to get spot price: ${parseContractError(error)}`);
    }
  }

  /** Calculate the expected output for a swap. */
  async getPoolAmountOut(
    poolAddress: string,
    tokenInIndex: number,
    tokenOutIndex: number,
    amountIn: bigint,
  ): Promise<{ amountOut: bigint; feeAmount: bigint }> {
    this.validateAddress(poolAddress, 'pool');
    const pool = this.getPoolContract(poolAddress);
    try {
      const [amountOut, feeAmount] = await pool.getAmountOut(tokenInIndex, tokenOutIndex, amountIn);
      return { amountOut: BigInt(amountOut), feeAmount: BigInt(feeAmount) };
    } catch (error: unknown) {
      throw new Error(`Failed to get swap quote: ${parseContractError(error)}`);
    }
  }

  /**
   * Retrieve token metadata (name, symbol, decimals) in a single
   * Multicall3 batch. Cached at TTL_METADATA (300 s).
   */
  async getTokenInfo(tokenAddress: string): Promise<OrbitalTokenInfo> {
    this.validateAddress(tokenAddress, 'token');
    const cacheKey = `orbital:token:${tokenAddress}:info`;
    const cached = getCached<OrbitalTokenInfo>(cacheKey);
    if (cached) return cached;

    try {
      const results = await multicallSameTarget(
        this.provider,
        tokenAddress,
        WrappedAssetABI,
        [
          { functionName: 'name' },
          { functionName: 'symbol' },
          { functionName: 'decimals' },
        ],
      );

      const info: OrbitalTokenInfo = {
        address: tokenAddress,
        name: results[0].success ? (results[0].data as string) : '',
        symbol: results[1].success ? (results[1].data as string) : '',
        decimals: results[2].success ? Number(results[2].data) : 18,
      };

      setCache(cacheKey, info, TTL_METADATA);
      return info;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch token info: ${parseContractError(error)}`);
    }
  }

  /** Get the LP token balance for a user in a specific pool. */
  async getLPBalance(poolAddress: string, user: string): Promise<bigint> {
    this.validateAddress(poolAddress, 'pool');
    this.validateAddress(user, 'user');
    const cacheKey = `orbital:pool:${poolAddress}:lp:${user}`;
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;

    const pool = this.getPoolContract(poolAddress);
    try {
      const balance = BigInt(await pool.balanceOf(user));
      setCache(cacheKey, balance, TTL_BALANCE);
      return balance;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch LP balance: ${parseContractError(error)}`);
    }
  }

  /** Get the ERC-20 token balance for a user. */
  async getTokenBalance(tokenAddress: string, user: string): Promise<bigint> {
    this.validateAddress(tokenAddress, 'token');
    this.validateAddress(user, 'user');
    const cacheKey = `orbital:token:${tokenAddress}:balance:${user}`;
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;

    const token = this.getTokenContract(tokenAddress);
    try {
      const balance = BigInt(await token.balanceOf(user));
      setCache(cacheKey, balance, TTL_BALANCE);
      return balance;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch token balance: ${parseContractError(error)}`);
    }
  }

  /** Get the ERC-20 allowance granted by an owner to a spender. */
  async getTokenAllowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
    this.validateAddress(tokenAddress, 'token');
    this.validateAddress(owner, 'owner');
    this.validateAddress(spender, 'spender');
    const cacheKey = `orbital:token:${tokenAddress}:allowance:${owner}:${spender}`;
    const cached = getCached<bigint>(cacheKey);
    if (cached !== undefined) return cached;

    const token = this.getTokenContract(tokenAddress);
    try {
      const allowance = BigInt(await token.allowance(owner, spender));
      setCache(cacheKey, allowance, TTL_BALANCE);
      return allowance;
    } catch (error: unknown) {
      throw new Error(`Failed to fetch token allowance: ${parseContractError(error)}`);
    }
  }

  // -----------------------------------------------------------------------
  // Router read operations
  // -----------------------------------------------------------------------

  /** Calculate expected swap output via the router (resolves token addresses to indices). */
  async getRouterAmountOut(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
  ): Promise<{ amountOut: bigint; feeAmount: bigint }> {
    this.validateAddress(poolAddress, 'pool');
    this.validateAddress(tokenIn, 'tokenIn');
    this.validateAddress(tokenOut, 'tokenOut');
    const router = this.getRouterContract();
    try {
      const [amountOut, feeAmount] = await router.getAmountOut(poolAddress, tokenIn, tokenOut, amountIn);
      return { amountOut: BigInt(amountOut), feeAmount: BigInt(feeAmount) };
    } catch (error: unknown) {
      throw new Error(`Failed to get router quote: ${parseContractError(error)}`);
    }
  }

  // -----------------------------------------------------------------------
  // Factory write operations
  // -----------------------------------------------------------------------

  /** Create a new Orbital pool via the factory. */
  async createPool(
    tokens: string[],
    concentration: number,
    swapFeeBps: number,
    name: string,
    symbol: string,
  ): Promise<ethers.ContractTransactionResponse> {
    for (let i = 0; i < tokens.length; i++) {
      this.validateAddress(tokens[i], `tokens[${i}]`);
    }
    const signer = await this.getSigner();
    const factory = this.getFactoryContract(signer);
    const tx = await this.executeWrite(factory, 'createPool', [
      tokens,
      concentration,
      swapFeeBps,
      name,
      symbol,
    ]);
    invalidatePoolCache();
    invalidateCache('orbital:factory:');
    return tx;
  }

  // -----------------------------------------------------------------------
  // Router write operations
  // -----------------------------------------------------------------------

  /**
   * Execute a token swap through the Orbital router.
   * Requires prior approval of tokenIn for the router address.
   */
  async swap(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    deadline: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(poolAddress, 'pool');
    this.validateAddress(tokenIn, 'tokenIn');
    this.validateAddress(tokenOut, 'tokenOut');
    const signer = await this.getSigner();
    const router = this.getRouterContract(signer);
    const tx = await this.executeWrite(router, 'swap', [
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      deadline,
    ]);
    // Invalidate affected caches after swap.
    invalidatePoolCache();
    invalidateCache(`orbital:token:${tokenIn}:`);
    invalidateCache(`orbital:token:${tokenOut}:`);
    invalidateCache(`orbital:pool:${poolAddress}:`);
    return tx;
  }

  /**
   * Add liquidity to an Orbital pool.
   * Requires prior approval of all tokens for the router address.
   *
   * @param poolAddress   The pool to add liquidity to.
   * @param amounts       Token amounts to deposit (one per pool token, in order).
   * @param minLiquidity  Minimum LP tokens to receive (slippage protection).
   * @param deadline      Unix timestamp deadline for the transaction.
   */
  async addLiquidity(
    poolAddress: string,
    amounts: bigint[],
    minLiquidity: bigint,
    deadline: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(poolAddress, 'pool');
    const signer = await this.getSigner();
    const router = this.getRouterContract(signer);
    const tx = await this.executeWrite(router, 'addLiquidity', [
      poolAddress,
      amounts,
      minLiquidity,
      deadline,
    ]);
    invalidatePoolCache();
    invalidateCache(`orbital:pool:${poolAddress}:`);
    return tx;
  }

  /**
   * Remove liquidity from an Orbital pool.
   *
   * @param poolAddress   The pool to remove liquidity from.
   * @param liquidity     Amount of LP tokens to burn.
   * @param minAmounts    Minimum token amounts to receive (one per pool token).
   * @param deadline      Unix timestamp deadline for the transaction.
   */
  async removeLiquidity(
    poolAddress: string,
    liquidity: bigint,
    minAmounts: bigint[],
    deadline: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(poolAddress, 'pool');
    const signer = await this.getSigner();
    const router = this.getRouterContract(signer);
    const tx = await this.executeWrite(router, 'removeLiquidity', [
      poolAddress,
      liquidity,
      minAmounts,
      deadline,
    ]);
    invalidatePoolCache();
    invalidateCache(`orbital:pool:${poolAddress}:`);
    return tx;
  }

  // -----------------------------------------------------------------------
  // Token approvals
  // -----------------------------------------------------------------------

  /** Approve a spender to transfer tokens on behalf of the connected wallet. */
  async approveToken(
    tokenAddress: string,
    spender: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    this.validateAddress(tokenAddress, 'token');
    this.validateAddress(spender, 'spender');
    const signer = await this.getSigner();
    const token = this.getTokenContract(tokenAddress, signer);
    const tx = await this.executeWrite(token, 'approve', [spender, amount]);
    invalidateCache(`orbital:token:${tokenAddress}:`);
    return tx;
  }

  /** Approve the Orbital router to spend a token. */
  async approveRouter(
    tokenAddress: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.orbitalRouterAddress) {
      throw new Error(`OrbitalRouter not deployed on chain ${this.chainId}`);
    }
    return this.approveToken(tokenAddress, config.orbitalRouterAddress, amount);
  }

  /** Approve a pool directly to spend a token. */
  async approvePool(
    tokenAddress: string,
    poolAddress: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    return this.approveToken(tokenAddress, poolAddress, amount);
  }

  // -----------------------------------------------------------------------
  // Address helpers
  // -----------------------------------------------------------------------

  /** Return the router contract address for the current chain. */
  getRouterAddress(): string {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.orbitalRouterAddress) {
      throw new Error(`OrbitalRouter not deployed on chain ${this.chainId}`);
    }
    return config.orbitalRouterAddress;
  }

  /** Return the factory contract address for the current chain. */
  getFactoryAddress(): string {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.orbitalFactoryAddress) {
      throw new Error(`OrbitalFactory not deployed on chain ${this.chainId}`);
    }
    return config.orbitalFactoryAddress;
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /** Wait for a transaction to be mined and return the receipt. */
  async waitForTransaction(
    tx: ethers.ContractTransactionResponse,
    confirmations = 1,
  ): Promise<ethers.TransactionReceipt> {
    const receipt = await tx.wait(confirmations);
    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }
    if (receipt.status === 0) {
      throw new Error(`Transaction reverted: ${tx.hash}`);
    }
    return receipt;
  }

  /**
   * Validate that a string is a well-formed Ethereum address.
   * Throws a descriptive error instead of letting ethers produce a
   * low-level "invalid address" deep inside an RPC call.
   */
  private validateAddress(address: string, label: string): void {
    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid ${label} address: ${address}`);
    }
    if (address === ethers.ZeroAddress) {
      throw new Error(`Invalid ${label} address: cannot be zero address`);
    }
  }

  /**
   * Execute a write transaction with upfront gas estimation.
   *
   * Gas estimation serves as a dry-run: if the transaction would revert,
   * the estimateGas call fails first with a descriptive Solidity error.
   * A 20% buffer is added on top of the estimate.
   */
  private async executeWrite(
    contract: ethers.Contract,
    method: string,
    args: unknown[],
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const gasEstimate: bigint = await contract[method].estimateGas(
        ...args,
        overrides ?? {},
      );
      const gasLimit = (gasEstimate * 120n) / 100n;
      return await contract[method](...args, {
        ...(overrides ?? {}),
        gasLimit,
      });
    } catch (err: unknown) {
      const userMessage = parseContractError(err);
      logger.error(`[OrbitalContractService] ${method} failed:`, err);
      throw new Error(userMessage);
    }
  }
}
