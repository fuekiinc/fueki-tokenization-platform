# Frontend RPC Call Inventory

This inventory tracks frontend-initiated RPC or RPC-adjacent blockchain data reads after the polling and batching pass on 2026-03-21.

| Surface | Data fetched | Trigger / component | Polling tier | Deduped / batched |
| --- | --- | --- | --- | --- |
| Wallet controller | Connected wallet native balance | [`src/wallet/WalletConnectionController.tsx`](../src/wallet/WalletConnectionController.tsx) | High, 8s foreground / 32s background | Yes, shared balance cache + in-flight dedupe |
| Pending transactions | Transaction receipt status for pending hashes | [`src/components/Layout/PendingTransactions.tsx`](../src/components/Layout/PendingTransactions.tsx) | High, 8s foreground / 32s background | Yes, one polling loop per mounted dropdown |
| Exchange order book | Active orders for selected pair | [`src/components/Exchange/OrderBook.tsx`](../src/components/Exchange/OrderBook.tsx) | Medium, 12s foreground / 48s background | Yes, contract-level cache + in-flight dedupe |
| User orders | Maker order ids, taker filled ids, order details, withdrawable ETH | [`src/components/Exchange/UserOrders.tsx`](../src/components/Exchange/UserOrders.tsx) | Medium, 12s foreground / 48s background | Yes, batched `getExchangeOrders()` + cached ids/details |
| Pool info | AMM pool reserves, totals, user LP balance | [`src/components/Exchange/PoolInfo.tsx`](../src/components/Exchange/PoolInfo.tsx) | Medium, 12s foreground / 48s background | Yes, single multicall snapshot + cache |
| Exchange liquidity panel | AMM pool snapshot, user LP balance, token balances | [`src/components/Exchange/LiquidityPanel.tsx`](../src/components/Exchange/LiquidityPanel.tsx) | Medium, 12s foreground / 48s background | Yes, multicall pool snapshot + batched balances |
| Trade form | Sell-token balance, allowance, AMM quote | [`src/components/Exchange/TradeForm.tsx`](../src/components/Exchange/TradeForm.tsx) | Medium for quote refresh, on-demand for balance/allowance | Yes, multicall-backed balance/allowance batch methods |
| Exchange asset hydration | Asset details + connected user balances | [`src/pages/ExchangePage.tsx`](../src/pages/ExchangePage.tsx) | On page load / network switch / refetch | Yes, `getMultipleAssetDetails()` + batched `getAssetBalances()` |
| Dashboard asset hydration | Asset details + connected user balances | [`src/pages/DashboardPage.tsx`](../src/pages/DashboardPage.tsx) | On page load / wallet refresh | Yes, `getUserAssetSnapshots()` |
| Portfolio asset hydration | Asset details + connected user balances | [`src/pages/PortfolioPage.tsx`](../src/pages/PortfolioPage.tsx) | On page load / wallet refresh | Yes, `getUserAssetSnapshots()` |
| Chart history | Historical candles from backend / on-chain aggregation | [`src/hooks/usePriceHistory.ts`](../src/hooks/usePriceHistory.ts), [`src/lib/chart/dataFeed.ts`](../src/lib/chart/dataFeed.ts) | Low, cached 45s | Yes, cache + in-flight dedupe |
| Chart live updates | Recent trades aggregated into live candles | [`src/lib/chart/dataFeed.ts`](../src/lib/chart/dataFeed.ts) | High / medium / low by interval and visibility | Yes, shared trade cache + adaptive polling |
| Orbital liquidity panel | Pool LP balance + per-token balances | [`src/components/OrbitalAMM/LiquidityPanel.tsx`](../src/components/OrbitalAMM/LiquidityPanel.tsx) | On selection / tx-state changes | Yes, batched token balances via multicall |
| Orbital swap interface | Pool quote, fee amount, allowance refresh after approval/swap | [`src/components/OrbitalAMM/SwapInterface.tsx`](../src/components/OrbitalAMM/SwapInterface.tsx) | Medium, 12s foreground / 48s background | Quote refresh is adaptive; post-tx balance/pool refresh uses shared refetch events |
| Deployment history | Backend deployment list for contracts UI | [`src/store/contractDeployerStore.ts`](../src/store/contractDeployerStore.ts), [`src/pages/ContractBrowserPage.tsx`](../src/pages/ContractBrowserPage.tsx), [`src/pages/ContractDeployPage.tsx`](../src/pages/ContractDeployPage.tsx) | Low, 45s foreground / 180s background | Yes, API response cache + in-flight dedupe |
| Deployment history page | Local + backend deployment history merge for `/contracts/history` | [`src/pages/ContractHistoryPage.tsx`](../src/pages/ContractHistoryPage.tsx) | Low, 45s foreground / 180s background | Yes, backend cache + in-flight dedupe |
| Static metadata | Token metadata, contract metadata, chain config, ABI fetches | Shared contract services and static config modules | On-demand only | Yes, long-lived metadata cache where applicable |

## Shared controls

- Polling tiers are defined in [`src/lib/rpc/polling.ts`](../src/lib/rpc/polling.ts).
- In-flight request dedupe is handled by [`src/lib/rpc/requestDedup.ts`](../src/lib/rpc/requestDedup.ts).
- Shared post-transaction refetch events are handled by [`src/lib/rpc/refetchEvents.ts`](../src/lib/rpc/refetchEvents.ts).
- Cross-contract balance / allowance / pool batching is routed through [`src/lib/rpc/multicall.ts`](../src/lib/rpc/multicall.ts).
