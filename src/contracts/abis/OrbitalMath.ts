/**
 * Human-readable ABI for the OrbitalMath library contract.
 *
 * Replaces the original OrbitalMath.json with a compact
 * ethers.js v6 human-readable ABI fragment array.
 */
export const OrbitalMathABI = [
  // Errors
  'error InvalidPower()',
  'error InvariantViolation()',
  'error MathOverflow()',
  'error ZeroInput()',
] as const;
