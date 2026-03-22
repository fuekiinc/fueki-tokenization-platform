import { useMemo } from 'react';
import { ContractService } from '../lib/blockchain/contracts';
import logger from '../lib/logger';
import { getProvider, useWalletStore } from '../store/walletStore';

interface UseContractServiceResult {
  contractService: ContractService | null;
  isReady: boolean;
}

export function useContractService(): UseContractServiceResult {
  const isConnected = useWalletStore((state) => state.wallet.isConnected);
  const chainId = useWalletStore((state) => state.wallet.chainId);
  const providerReady = useWalletStore((state) => state.wallet.providerReady);
  const provider = getProvider();

  const isReady = Boolean(isConnected && chainId && providerReady && provider);

  const contractService = useMemo(() => {
    if (!provider || !chainId || !isConnected || !providerReady) {
      return null;
    }

    try {
      return new ContractService(provider, chainId);
    } catch (error) {
      logger.error('Failed to initialize ContractService from wallet context', error);
      return null;
    }
  }, [provider, chainId, isConnected, providerReady]);

  return { contractService, isReady };
}
