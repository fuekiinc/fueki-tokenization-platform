"""
Reference Newton solver helpers for Orbital AMM test cross-validation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class NewtonResult:
    root: float
    iterations: int
    converged: bool
    residual: float


def newton_solve(
    f: Callable[[float], float],
    df: Callable[[float], float],
    x0: float,
    max_iter: int = 64,
    eps: float = 1e-12,
) -> NewtonResult:
    x = x0
    for i in range(1, max_iter + 1):
        fx = f(x)
        if abs(fx) <= eps:
            return NewtonResult(root=x, iterations=i, converged=True, residual=abs(fx))
        dfx = df(x)
        if dfx == 0:
            return NewtonResult(root=x, iterations=i, converged=False, residual=abs(fx))
        x = x - fx / dfx
    return NewtonResult(root=x, iterations=max_iter, converged=False, residual=abs(f(x)))


def quartic_example_root(target: float) -> NewtonResult:
    """Solve x^4 - target = 0 for x > 0."""

    def f(x: float) -> float:
        return x**4 - target

    def df(x: float) -> float:
        return 4.0 * x**3

    guess = max(target, 1.0) ** 0.25
    return newton_solve(f, df, guess)


if __name__ == "__main__":
    result = quartic_example_root(16.0)
    if not result.converged:
        raise SystemExit("Newton solver did not converge")
    print(f"converged root={result.root:.12f} iterations={result.iterations}")
