/**
 * Deterministic wallet fixtures for local/integration tests.
 *
 * These are publicly-known development keys from Hardhat/Anvil and must never
 * be used outside local/test environments.
 */
export interface WalletFixture {
  label: string;
  privateKey: string;
  address: string;
}

export const WALLET_FIXTURES: WalletFixture[] = [
  {
    label: 'deployer',
    privateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
  {
    label: 'trader',
    privateKey:
      '0x59c6995e998f97a5a0044966f094538f8f7f4f299f4e8f1fbe53c7f6f7f7f7f7',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  },
  {
    label: 'lp',
    privateKey:
      '0x5de4111afa1a4b94908f2736a8f3cf58d54a39d0f2cc8dece274164a49109123',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  },
];
