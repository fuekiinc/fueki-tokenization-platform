import assert from 'node:assert/strict';
import test from 'node:test';
import { ethers } from 'ethers';
import { LiquidityPoolAMMABI } from '../../src/contracts/abis/LiquidityPoolAMM';

test('LiquidityPoolAMM addLiquidityETH ABI matches deployed contract signature', () => {
  const iface = new ethers.Interface(LiquidityPoolAMMABI);
  const fragment = iface.getFunction('addLiquidityETH');
  assert.ok(fragment);
  assert.equal(fragment.inputs.length, 6);
  assert.deepEqual(
    fragment.inputs.map((input) => input.name),
    [
      'token',
      'amountTokenDesired',
      'amountTokenMin',
      'amountETHMin',
      'minLiquidity',
      'deadline',
    ],
  );
});
