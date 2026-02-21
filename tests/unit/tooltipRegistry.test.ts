import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTooltipBody,
  shouldShowLearnMore,
  shouldShowTooltipForHelpLevel,
  getValidatedTooltipLinks,
  type TooltipDefinition,
  getTooltipDefinition,
} from '../../src/lib/tooltipRegistry';

test('tier fallback always resolves toward more detail', () => {
  const noviceOnly: TooltipDefinition = {
    bodyByLevel: {
      novice: 'novice body',
    },
  };
  const intermediateOnly: TooltipDefinition = {
    bodyByLevel: {
      novice: 'novice body',
      intermediate: 'intermediate body',
    },
  };

  assert.equal(getTooltipBody(noviceOnly, 'expert'), 'novice body');
  assert.equal(getTooltipBody(intermediateOnly, 'expert'), 'intermediate body');
  assert.equal(getTooltipBody(intermediateOnly, 'intermediate'), 'intermediate body');
});

test('help-level visibility gating follows novice -> intermediate -> expert density', () => {
  const noviceTooltip = getTooltipDefinition('mint.mintAmount');
  const intermediateTooltip = getTooltipDefinition('swap.slippage');
  const expertTooltip = getTooltipDefinition('security.complianceDisclosure');

  assert.equal(shouldShowTooltipForHelpLevel(noviceTooltip, 'novice'), true);
  assert.equal(shouldShowTooltipForHelpLevel(noviceTooltip, 'intermediate'), false);
  assert.equal(shouldShowTooltipForHelpLevel(noviceTooltip, 'expert'), false);

  assert.equal(shouldShowTooltipForHelpLevel(intermediateTooltip, 'novice'), true);
  assert.equal(shouldShowTooltipForHelpLevel(intermediateTooltip, 'intermediate'), true);
  assert.equal(shouldShowTooltipForHelpLevel(intermediateTooltip, 'expert'), false);

  assert.equal(shouldShowTooltipForHelpLevel(expertTooltip, 'novice'), true);
  assert.equal(shouldShowTooltipForHelpLevel(expertTooltip, 'intermediate'), true);
  assert.equal(shouldShowTooltipForHelpLevel(expertTooltip, 'expert'), true);
});

test('expert product-specific override keeps critical Fueki tooltips visible', () => {
  const productSpecific = getTooltipDefinition('security.transferRestrictions');
  assert.equal(shouldShowTooltipForHelpLevel(productSpecific, 'expert'), true);
});

test('learn more gating behaves correctly for expert mode', () => {
  const productSpecific = getTooltipDefinition('security.transferRestrictions');
  const riskCritical = getTooltipDefinition('swap.slippage');
  const basic = getTooltipDefinition('mint.mintAmount');

  assert.equal(shouldShowLearnMore(productSpecific, 'expert'), true);
  assert.equal(shouldShowLearnMore(riskCritical, 'expert'), true);
  assert.equal(shouldShowLearnMore(basic, 'expert'), false);
});

test('tooltip links only return valid internal routes', () => {
  const links = getValidatedTooltipLinks({
    bodyByLevel: { novice: 'x' },
    links: ['/mint', '/invalid-route', '/security-tokens/deploy'],
  });
  assert.deepEqual(links, ['/mint', '/security-tokens/deploy']);
});
