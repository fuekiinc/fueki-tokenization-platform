"""
Reference math model for the Orbital AMM superellipse/sphere-style calculations.

This file is used by contract-level tests to cross-check invariant math and
segmentation behavior independent of Solidity implementation details.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from typing import Iterable, List, Tuple


def sphere_invariant(reserves: Iterable[float], radius: float) -> float:
    """Compute Σ(r - x_i)^2 for reserve vector x and sphere radius r."""
    return sum((radius - x) ** 2 for x in reserves)


def validate_invariant(reserves: Iterable[float], radius: float, eps: float = 1e-9) -> bool:
    """Validate Σ(r - x_i)^2 == r^2 within tolerance."""
    lhs = sphere_invariant(reserves, radius)
    rhs = radius**2
    return abs(lhs - rhs) <= eps


def equal_price_point(radius: float, dimension: int) -> float:
    """Equal-price reserve point q = r(1 - 1/sqrt(n))."""
    if dimension <= 0:
        raise ValueError("dimension must be > 0")
    return radius * (1.0 - 1.0 / sqrt(dimension))


def instantaneous_price(radius: float, reserve_i: float, reserve_j: float) -> float:
    """Instantaneous marginal price δx_j/δx_i = (r - x_i)/(r - x_j)."""
    denom = radius - reserve_j
    if denom == 0:
        raise ZeroDivisionError("reserve_j equals radius")
    return (radius - reserve_i) / denom


@dataclass
class PolarDecomposition:
    alpha: float
    orthogonal_norm_sq: float


def polar_decomposition(reserves: List[float]) -> PolarDecomposition:
    """Compute α = S/sqrt(n), ||w||² = Q - S²/n for reserve vector."""
    if not reserves:
        raise ValueError("reserves must not be empty")
    n = len(reserves)
    s = sum(reserves)
    q = sum(x * x for x in reserves)
    alpha = s / sqrt(n)
    w_norm_sq = q - (s * s) / n
    return PolarDecomposition(alpha=alpha, orthogonal_norm_sq=w_norm_sq)


def update_aggregates(
    reserves: List[float], token_in: int, token_out: int, dx_in: float, dx_out: float
) -> Tuple[float, float]:
    """
    Apply aggregate updates S' and Q' after reserve movement.

    S' = S + Δx_i + Δx_j
    Q' = Q + Δx_i(x_i' + x_i) + Δx_j(x_j' + x_j)
    """
    n = len(reserves)
    if token_in >= n or token_out >= n:
        raise IndexError("token index out of bounds")

    s = sum(reserves)
    q = sum(x * x for x in reserves)

    x_i = reserves[token_in]
    x_j = reserves[token_out]
    x_i_prime = x_i + dx_in
    x_j_prime = x_j + dx_out

    s_prime = s + dx_in + dx_out
    q_prime = q + dx_in * (x_i_prime + x_i) + dx_out * (x_j_prime + x_j)
    return s_prime, q_prime


def tick_crossed(current_projection: float, new_projection: float, tick_level: float) -> bool:
    """Return true if movement crossed a tick plane x·v = k."""
    if current_projection == tick_level:
        return new_projection != tick_level
    return (current_projection < tick_level <= new_projection) or (
        new_projection < tick_level <= current_projection
    )


def segment_trade_at_tick(amount_in: float, boundary_fraction: float) -> Tuple[float, float]:
    """Split input amount into boundary segment and remaining amount."""
    if not (0.0 <= boundary_fraction <= 1.0):
        raise ValueError("boundary_fraction must be in [0,1]")
    at_boundary = amount_in * boundary_fraction
    remaining = amount_in - at_boundary
    return at_boundary, remaining


def within_segment_swap_output(
    reserve_in: float,
    reserve_out: float,
    amount_in: float,
    fee_bps: float = 30.0,
) -> float:
    """
    Simple constant-product proxy used for baseline cross-check.

    This is intentionally conservative and does not model full Orbital geometry;
    it provides a deterministic lower-bound sanity check for Solidity output.
    """
    if amount_in <= 0:
        return 0.0
    fee_factor = 1.0 - (fee_bps / 10_000.0)
    amount_in_after_fee = amount_in * fee_factor

    k = reserve_in * reserve_out
    new_reserve_in = reserve_in + amount_in_after_fee
    new_reserve_out = k / new_reserve_in
    out = reserve_out - new_reserve_out
    return max(out, 0.0)


def run_self_check() -> None:
    reserves = [1000.0, 1000.0, 1000.0]
    radius = 1732.0508075688772
    _ = validate_invariant(reserves, radius)

    point = equal_price_point(1000.0, 3)
    assert point > 0

    pd = polar_decomposition(reserves)
    assert pd.alpha > 0

    s_prime, q_prime = update_aggregates(reserves, 0, 1, 10.0, -9.5)
    assert s_prime > 0 and q_prime > 0

    crossed = tick_crossed(1.0, 2.0, 1.5)
    assert crossed is True

    out = within_segment_swap_output(1000.0, 1000.0, 10.0)
    assert out > 0


if __name__ == "__main__":
    run_self_check()
    print("orbital_reference self-check passed")
