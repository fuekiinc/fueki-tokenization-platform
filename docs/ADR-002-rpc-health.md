# ADR-002: 3-Strike RPC Health Model

## Status
Implemented

## Context
Platform supports 11 EVM chains. RPC endpoints go down frequently. Users experience transaction failures and stale data when hitting unhealthy endpoints.

## Decision
Implement a 3-strike health tracking model:
- Each RPC endpoint starts healthy
- Failures increment a strike counter
- 3 strikes = endpoint marked unhealthy with 20s cooldown
- `findHealthyEndpoint()` uses `Promise.any()` to probe endpoints in parallel
- Healthy endpoint cached for 3 minutes
- Success resets strike counter

## Consequences
- Resilient to single-endpoint failures
- Parallel probing adds ~100ms latency on cache miss
- Burst of requests possible when cooldowns expire simultaneously
- Endpoint returning 200 with error JSON body not detected as unhealthy (known gap)
