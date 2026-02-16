/**
 * Blockchain contract interaction layer for the Orbital AMM.
 *
 * Provides a typed service class wrapping ethers.js calls for OrbitalFactory,
 * OrbitalRouter, and individual OrbitalPool contracts.
 */

import { ethers } from 'ethers';
import { OrbitalFactoryABI } from '../../contracts/abis/OrbitalFactory.ts';
import { OrbitalRouterABI } from '../../contracts/abis/OrbitalRouter.ts';
import { OrbitalPoolABI } from '../../contracts/abis/OrbitalPool.ts';
import { WrappedAssetABI } from '../../contracts/abis/WrappedAsset.ts';
import { getNetworkConfig } from '../../contracts/addresses';
import { multicallSameTarget } from './multicall.ts';

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
    if (!poolAddress || poolAddress === ethers.ZeroAddress) {
      throw new Error('Invalid pool address: cannot be empty or zero');
    }
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
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      throw new Error('Invalid token address: cannot be empty or zero');
    }
    return new ethers.Contract(
      tokenAddress,
      WrappedAssetABI,
      signerOrProvider || this.provider,
    );
  }

  // -----------------------------------------------------------------------
  // Factory read operations
  // -----------------------------------------------------------------------

  async getAllPools(): Promise<string[]> {
    const factory = this.getFactoryContract();
    return await factory.getAllPools();
  }

  async getTotalPools(): Promise<bigint> {
    const factory = this.getFactoryContract();
    return await factory.totalPools();
  }

  async getPoolsForToken(token: string): Promise<string[]> {
    const factory = this.getFactoryContract();
    return await factory.getPoolsForToken(token);
  }

  async getPool(tokens: string[], concentration: number): Promise<string> {
    const factory = this.getFactoryContract();
    return await factory.getPool(tokens, concentration);
  }

  // -----------------------------------------------------------------------
  // Pool read operations
  // -----------------------------------------------------------------------

  async getPoolInfo(poolAddress: string): Promise<OrbitalPoolInfo> {
    // Batch all pool property reads into a single RPC call via Multicall3.
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

    return {
      address: poolAddress,
      name: results[0].success ? (results[0].data as string) : '',
      symbol: results[1].success ? (results[1].data as string) : '',
      tokens: results[2].success ? (results[2].data as string[]) : [],
      reserves: results[3].success ? (results[3].data as bigint[]).map((r: bigint) => BigInt(r)) : [],
      concentration: results[4].success ? Number(results[4].data) : 0,
      swapFeeBps: results[5].success ? BigInt(results[5].data as bigint) : 0n,
      totalSupply: results[6].success ? BigInt(results[6].data as bigint) : 0n,
      invariant: results[7].success ? BigInt(results[7].data as bigint) : 0n,
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<OrbitalTokenInfo> {
    // Batch all token property reads into a single RPC call via Multicall3.
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

    return {
      address: tokenAddress,
      name: results[0].success ? (results[0].data as string) : '',
      symbol: results[1].success ? (results[1].data as string) : '',
      decimals: results[2].success ? Number(results[2].data) : 18,
    };
  }

  async getPoolAmountOut(
    poolAddress: string,
    tokenInIndex: number,
    tokenOutIndex: number,
    amountIn: bigint,
  ): Promise<{ amountOut: bigint; feeAmount: bigint }> {
    const pool = this.getPoolContract(poolAddress);
    const [amountOut, feeAmount] = await pool.getAmountOut(tokenInIndex, tokenOutIndex, amountIn);
    return { amountOut: BigInt(amountOut), feeAmount: BigInt(feeAmount) };
  }

  async getSpotPrice(
    poolAddress: string,
    tokenAIndex: number,
    tokenBIndex: number,
  ): Promise<bigint> {
    const pool = this.getPoolContract(poolAddress);
    return BigInt(await pool.getSpotPrice(tokenAIndex, tokenBIndex));
  }

  async getLPBalance(poolAddress: string, user: string): Promise<bigint> {
    const pool = this.getPoolContract(poolAddress);
    return BigInt(await pool.balanceOf(user));
  }

  async getTokenBalance(tokenAddress: string, user: string): Promise<bigint> {
    const token = this.getTokenContract(tokenAddress);
    return BigInt(await token.balanceOf(user));
  }

  async getTokenAllowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
    const token = this.getTokenContract(tokenAddress);
    return BigInt(await token.allowance(owner, spender));
  }

  // -----------------------------------------------------------------------
  // Router read operations
  // -----------------------------------------------------------------------

  async getRouterAmountOut(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
  ): Promise<{ amountOut: bigint; feeAmount: bigint }> {
    const router = this.getRouterContract();
    const [amountOut, feeAmount] = await router.getAmountOut(poolAddress, tokenIn, tokenOut, amountIn);
    return { amountOut: BigInt(amountOut), feeAmount: BigInt(feeAmount) };
  }

  // -----------------------------------------------------------------------
  // Factory write operations
  // -----------------------------------------------------------------------

  async createPool(
    tokens: string[],
    concentration: number,
    swapFeeBps: number,
    name: string,
    symbol: string,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const factory = this.getFactoryContract(signer);
    return this.executeWrite(factory, 'createPool', [
      tokens,
      concentration,
      swapFeeBps,
      name,
      symbol,
    ]);
  }

  // -----------------------------------------------------------------------
  // Router write operations
  // -----------------------------------------------------------------------

  async swap(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    deadline: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const router = this.getRouterContract(signer);
    return this.executeWrite(router, 'swap', [
      poolAddress,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      deadline,
    ]);
  }

  async addLiquidity(
    poolAddress: string,
    amounts: bigint[],
    minLiquidity: bigint,
    deadline: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const router = this.getRouterContract(signer);
    return this.executeWrite(router, 'addLiquidity', [
      poolAddress,
      amounts,
      minLiquidity,
      deadline,
    ]);
  }

  async removeLiquidity(
    poolAddress: string,
    liquidity: bigint,
    minAmounts: bigint[],
    deadline: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const router = this.getRouterContract(signer);
    return this.executeWrite(router, 'removeLiquidity', [
      poolAddress,
      liquidity,
      minAmounts,
      deadline,
    ]);
  }

  // -----------------------------------------------------------------------
  // Token approvals
  // -----------------------------------------------------------------------

  async approveToken(
    tokenAddress: string,
    spender: string,
    amount: bigint,
  ): Promise<ethers.ContractTransactionResponse> {
    const signer = await this.getSigner();
    const token = this.getTokenContract(tokenAddress, signer);
    return this.executeWrite(token, 'approve', [spender, amount]);
  }

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

  getRouterAddress(): string {
    const config = getNetworkConfig(this.chainId);
    if (!config || !config.orbitalRouterAddress) {
      throw new Error(`OrbitalRouter not deployed on chain ${this.chainId}`);
    }
    return config.orbitalRouterAddress;
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

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
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Transaction "${method}" failed during gas estimation (likely to revert): ${reason}`,
      );
    }
  }
}
