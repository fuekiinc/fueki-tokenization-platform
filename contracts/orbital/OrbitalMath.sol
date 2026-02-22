// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OrbitalMath
 * @notice Fixed-point math library for the Orbital AMM superellipse invariant.
 *
 *         The Orbital AMM uses a superellipse curve: Sum(xi^p) = K
 *         where xi are WAD-normalized reserves, p is the concentration
 *         parameter, and K is the invariant constant.
 *
 *         All values use WAD (1e18) fixed-point representation.
 *         Supported concentration powers: 2, 4, 8, 16, 32.
 *         These are computed via repeated squaring / repeated sqrt.
 *
 * @dev    Designed for gas efficiency -- no loops for power computation,
 *         only chained multiplications and square roots.
 */
library OrbitalMath {

    // ---------------------------------------------------------------
    //  Constants
    // ---------------------------------------------------------------

    uint256 internal constant WAD = 1e18;
    uint256 internal constant HALF_WAD = 5e17;

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error MathOverflow();
    error InvalidPower();
    error ZeroInput();
    error InvariantViolation();

    // ---------------------------------------------------------------
    //  WAD Arithmetic
    // ---------------------------------------------------------------

    /// @notice WAD multiply: (a * b) / WAD, rounded down.
    function wadMul(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b) / WAD;
    }

    /// @notice WAD multiply with rounding to nearest: (a * b + HALF_WAD) / WAD.
    function wadMulRound(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b + HALF_WAD) / WAD;
    }

    /// @notice WAD divide: (a * WAD) / b, rounded down.
    function wadDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        if (b == 0) revert ZeroInput();
        return (a * WAD) / b;
    }

    // ---------------------------------------------------------------
    //  Power Functions (WAD-scaled)
    // ---------------------------------------------------------------

    /// @notice Compute x^2 in WAD arithmetic.
    function wadPow2(uint256 x) internal pure returns (uint256) {
        return (x * x) / WAD;
    }

    /// @notice Compute x^4 in WAD arithmetic.
    function wadPow4(uint256 x) internal pure returns (uint256) {
        uint256 x2 = (x * x) / WAD;
        return (x2 * x2) / WAD;
    }

    /// @notice Compute x^8 in WAD arithmetic.
    function wadPow8(uint256 x) internal pure returns (uint256) {
        uint256 x2 = (x * x) / WAD;
        uint256 x4 = (x2 * x2) / WAD;
        return (x4 * x4) / WAD;
    }

    /// @notice Compute x^16 in WAD arithmetic.
    function wadPow16(uint256 x) internal pure returns (uint256) {
        uint256 x2 = (x * x) / WAD;
        uint256 x4 = (x2 * x2) / WAD;
        uint256 x8 = (x4 * x4) / WAD;
        return (x8 * x8) / WAD;
    }

    /// @notice Compute x^32 in WAD arithmetic.
    function wadPow32(uint256 x) internal pure returns (uint256) {
        uint256 x2 = (x * x) / WAD;
        uint256 x4 = (x2 * x2) / WAD;
        uint256 x8 = (x4 * x4) / WAD;
        uint256 x16 = (x8 * x8) / WAD;
        return (x16 * x16) / WAD;
    }

    /// @notice Compute x^p in WAD arithmetic for supported powers.
    /// @param x    WAD-scaled input value.
    /// @param p    Power exponent (must be 2, 4, 8, 16, or 32).
    /// @return result WAD-scaled x^p.
    function wadPow(uint256 x, uint8 p) internal pure returns (uint256 result) {
        if (p == 2) return wadPow2(x);
        if (p == 4) return wadPow4(x);
        if (p == 8) return wadPow8(x);
        if (p == 16) return wadPow16(x);
        if (p == 32) return wadPow32(x);
        revert InvalidPower();
    }

    // ---------------------------------------------------------------
    //  Root Functions (WAD-scaled)
    // ---------------------------------------------------------------

    /// @notice Compute the integer square root of y using the Babylonian method.
    ///         NOT WAD-scaled -- operates on raw integers.
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /// @notice Compute the square root of a WAD-scaled value, returning WAD-scaled result.
    ///         wadSqrt(x) = sqrt(x * WAD) so that wadSqrt(4e18) = 2e18.
    function wadSqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        // Safe path: x * WAD won't overflow
        if (x <= type(uint256).max / WAD) {
            return sqrt(x * WAD);
        }
        // Large x path: sqrt(x * WAD) = sqrt(x) * sqrt(WAD)
        // sqrt(1e18) = 1e9
        return sqrt(x) * 1e9;
    }

    /// @notice Compute x^(1/2) in WAD.
    function wadRoot2(uint256 x) internal pure returns (uint256) {
        return wadSqrt(x);
    }

    /// @notice Compute x^(1/4) in WAD = sqrt(sqrt(x)).
    function wadRoot4(uint256 x) internal pure returns (uint256) {
        return wadSqrt(wadSqrt(x));
    }

    /// @notice Compute x^(1/8) in WAD = sqrt(sqrt(sqrt(x))).
    function wadRoot8(uint256 x) internal pure returns (uint256) {
        return wadSqrt(wadSqrt(wadSqrt(x)));
    }

    /// @notice Compute x^(1/16) in WAD.
    function wadRoot16(uint256 x) internal pure returns (uint256) {
        return wadSqrt(wadSqrt(wadSqrt(wadSqrt(x))));
    }

    /// @notice Compute x^(1/32) in WAD.
    function wadRoot32(uint256 x) internal pure returns (uint256) {
        return wadSqrt(wadSqrt(wadSqrt(wadSqrt(wadSqrt(x)))));
    }

    /// @notice Compute x^(1/p) in WAD arithmetic for supported powers.
    /// @param x    WAD-scaled input value.
    /// @param p    Root index (must be 2, 4, 8, 16, or 32).
    /// @return result WAD-scaled x^(1/p).
    function wadRoot(uint256 x, uint8 p) internal pure returns (uint256 result) {
        if (p == 2) return wadRoot2(x);
        if (p == 4) return wadRoot4(x);
        if (p == 8) return wadRoot8(x);
        if (p == 16) return wadRoot16(x);
        if (p == 32) return wadRoot32(x);
        revert InvalidPower();
    }

    // ---------------------------------------------------------------
    //  Orbital AMM Core Computations
    // ---------------------------------------------------------------

    /**
     * @notice Compute the superellipse invariant K = Sum(xi^p) for given
     *         WAD-normalized reserves.
     *
     * @param normalizedReserves  Array of WAD-normalized reserve values.
     *                            At equilibrium, each value equals WAD (1e18).
     * @param p                   Concentration power (2, 4, 8, 16, 32).
     * @return K  The invariant constant (WAD-scaled).
     */
    function computeInvariant(
        uint256[] memory normalizedReserves,
        uint8 p
    ) internal pure returns (uint256 K) {
        uint256 n = normalizedReserves.length;
        for (uint256 i = 0; i < n; ++i) {
            K += wadPow(normalizedReserves[i], p);
        }
    }

    /**
     * @notice Compute the output amount for a swap using the superellipse invariant.
     *
     *         Given:
     *           - Current normalized reserves: x[0], x[1], ..., x[n-1]
     *           - Input token index: tokenIn
     *           - Output token index: tokenOut
     *           - Normalized input amount (after fees): dxNorm
     *           - Concentration power: p
     *
     *         The invariant K = Sum(xi^p) must be preserved.
     *         New x[tokenIn] = old x[tokenIn] + dxNorm
     *         New x[tokenOut] = (K - Sum_{k != tokenOut} x[k]_new^p) ^ (1/p)
     *         Output = old x[tokenOut] - new x[tokenOut]
     *
     * @param normalizedReserves WAD-normalized reserves array.
     * @param tokenInIndex       Index of input token.
     * @param tokenOutIndex      Index of output token.
     * @param dxNorm             WAD-normalized input amount (after fee).
     * @param p                  Concentration power.
     * @return dyNorm WAD-normalized output amount.
     */
    function computeSwapOutput(
        uint256[] memory normalizedReserves,
        uint256 tokenInIndex,
        uint256 tokenOutIndex,
        uint256 dxNorm,
        uint8 p
    ) internal pure returns (uint256 dyNorm) {
        uint256 n = normalizedReserves.length;

        // Compute K (current invariant)
        uint256 K = computeInvariant(normalizedReserves, p);

        // Compute sum of x[k]^p for k != tokenOut, with updated x[tokenIn]
        uint256 sumOthers = 0;
        for (uint256 k = 0; k < n; ++k) {
            if (k == tokenOutIndex) continue;
            uint256 xk = normalizedReserves[k];
            if (k == tokenInIndex) {
                xk += dxNorm;
            }
            sumOthers += wadPow(xk, p);
        }

        // The new reserve for tokenOut must satisfy: sumOthers + x[tokenOut]_new^p = K
        if (sumOthers >= K) revert InvariantViolation();
        uint256 remainder = K - sumOthers;

        // x[tokenOut]_new = remainder^(1/p)
        uint256 newReserveOut = wadRoot(remainder, p);

        // Output is the decrease in tokenOut reserve
        uint256 oldReserveOut = normalizedReserves[tokenOutIndex];
        if (newReserveOut >= oldReserveOut) revert InvariantViolation();

        dyNorm = oldReserveOut - newReserveOut;
    }

    /**
     * @notice Compute the amount of LP tokens to mint for a balanced deposit.
     *
     *         For a balanced deposit where each token amount is proportional
     *         to current reserves, LP tokens are minted proportional to the
     *         increase in the invariant K.
     *
     * @param currentK       Current invariant K.
     * @param newK           New invariant K after deposit.
     * @param totalLiquidity Current total LP supply.
     * @param p              Concentration power.
     * @return mintAmount    Number of LP tokens to mint.
     */
    function computeLiquidityMint(
        uint256 currentK,
        uint256 newK,
        uint256 totalLiquidity,
        uint8 p
    ) internal pure returns (uint256 mintAmount) {
        if (totalLiquidity == 0) {
            // First deposit: LP = K^(1/p) (geometric interpretation: "radius")
            mintAmount = wadRoot(newK, p);
        } else {
            // Subsequent deposits: proportional to K increase
            // LP_new = LP_old * (K_new^(1/p) / K_old^(1/p))
            uint256 oldRadius = wadRoot(currentK, p);
            uint256 newRadius = wadRoot(newK, p);
            if (newRadius <= oldRadius) revert InvariantViolation();
            mintAmount = (totalLiquidity * (newRadius - oldRadius)) / oldRadius;
        }
    }

    /**
     * @notice Compute the token amounts returned when burning LP tokens.
     *
     * @param reserves       Current raw reserves array.
     * @param liquidity      Amount of LP tokens to burn.
     * @param totalLiquidity Current total LP supply.
     * @return amounts       Array of token amounts to return.
     */
    function computeLiquidityBurn(
        uint256[] memory reserves,
        uint256 liquidity,
        uint256 totalLiquidity
    ) internal pure returns (uint256[] memory amounts) {
        uint256 n = reserves.length;
        amounts = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            amounts[i] = (reserves[i] * liquidity) / totalLiquidity;
        }
    }

    /**
     * @notice Normalize raw reserves to WAD scale relative to a reference
     *         total D. At equilibrium (all reserves equal), each normalized
     *         value equals WAD.
     *
     * @param reserves Raw reserve amounts.
     * @param n        Number of tokens.
     * @return normalized Array of WAD-normalized reserves.
     * @return D        Sum of all reserves (used as normalization base).
     */
    function normalizeReserves(
        uint256[] memory reserves,
        uint256 n
    ) internal pure returns (uint256[] memory normalized, uint256 D) {
        normalized = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            D += reserves[i];
        }
        if (D == 0) revert ZeroInput();
        for (uint256 i = 0; i < n; ++i) {
            // xi = n * ri * WAD / D
            // At equilibrium: ri = D/n, so xi = n * (D/n) * WAD / D = WAD
            normalized[i] = (n * reserves[i] * WAD) / D;
        }
    }
}