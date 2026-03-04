import { AutoConnect } from 'thirdweb/react';
import {
  getThirdwebAppMetadata,
  THIRDWEB_WALLETS,
  thirdwebClient,
} from '../lib/thirdweb';
import { WalletConnectionController } from './WalletConnectionController';

export default function WalletRuntime() {
  return (
    <>
      {thirdwebClient && (
        <AutoConnect
          client={thirdwebClient}
          wallets={THIRDWEB_WALLETS}
          appMetadata={getThirdwebAppMetadata()}
        />
      )}
      <WalletConnectionController />
    </>
  );
}
