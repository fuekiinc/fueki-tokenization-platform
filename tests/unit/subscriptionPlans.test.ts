import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isContractDeploymentOnlyPlan } from '../../src/lib/subscriptionPlans';

test('contract-deployment-only plans are detected correctly', () => {
  assert.equal(isContractDeploymentOnlyPlan('contract_deployment_monthly'), true);
  assert.equal(isContractDeploymentOnlyPlan('contract_deployment_annual'), true);
  assert.equal(isContractDeploymentOnlyPlan('contract_deployment_white_glove'), true);
});

test('full-platform plans are not treated as contract-only', () => {
  assert.equal(isContractDeploymentOnlyPlan('monthly'), false);
  assert.equal(isContractDeploymentOnlyPlan('annual'), false);
  assert.equal(isContractDeploymentOnlyPlan('full_service'), false);
  assert.equal(isContractDeploymentOnlyPlan(null), false);
  assert.equal(isContractDeploymentOnlyPlan(undefined), false);
});

