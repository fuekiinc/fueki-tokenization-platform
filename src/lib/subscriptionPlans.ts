import type { SubscriptionPlan } from '../types/auth';

export const CONTRACT_DEPLOYMENT_ONLY_PLANS = new Set<SubscriptionPlan>([
  'contract_deployment_monthly',
  'contract_deployment_annual',
  'contract_deployment_white_glove',
]);

export function isContractDeploymentOnlyPlan(
  plan: SubscriptionPlan | null | undefined,
): boolean {
  if (!plan) return false;
  return CONTRACT_DEPLOYMENT_ONLY_PLANS.has(plan);
}

