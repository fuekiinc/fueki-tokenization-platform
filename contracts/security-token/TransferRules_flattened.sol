

// Sources flattened with hardhat v2.28.6 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC20/IERC20.sol)

pragma solidity ^0.8.0;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}


// File @openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol@v4.9.6

// OpenZeppelin Contracts v4.4.1 (token/ERC20/extensions/IERC20Metadata.sol)


/**
 * @dev Interface for the optional metadata functions from the ERC20 standard.
 *
 * _Available since v4.1._
 */
interface IERC20Metadata is IERC20 {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}


// File @openzeppelin/contracts/utils/Context.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.4) (utils/Context.sol)


/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/token/ERC20/ERC20.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC20/ERC20.sol)


/**
 * @dev Implementation of the {IERC20} interface.
 *
 * This implementation is agnostic to the way tokens are created. This means
 * that a supply mechanism has to be added in a derived contract using {_mint}.
 * For a generic mechanism see {ERC20PresetMinterPauser}.
 *
 * TIP: For a detailed writeup see our guide
 * https://forum.openzeppelin.com/t/how-to-implement-erc20-supply-mechanisms/226[How
 * to implement supply mechanisms].
 *
 * The default value of {decimals} is 18. To change this, you should override
 * this function so it returns a different value.
 *
 * We have followed general OpenZeppelin Contracts guidelines: functions revert
 * instead returning `false` on failure. This behavior is nonetheless
 * conventional and does not conflict with the expectations of ERC20
 * applications.
 *
 * Additionally, an {Approval} event is emitted on calls to {transferFrom}.
 * This allows applications to reconstruct the allowance for all accounts just
 * by listening to said events. Other implementations of the EIP may not emit
 * these events, as it isn't required by the specification.
 *
 * Finally, the non-standard {decreaseAllowance} and {increaseAllowance}
 * functions have been added to mitigate the well-known issues around setting
 * allowances. See {IERC20-approve}.
 */
contract ERC20 is Context, IERC20, IERC20Metadata {
    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    /**
     * @dev Sets the values for {name} and {symbol}.
     *
     * All two of these values are immutable: they can only be set once during
     * construction.
     */
    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the default value returned by this function, unless
     * it's overridden.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, amount);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `amount`.
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    /**
     * @dev Moves `amount` of tokens from `from` to `to`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     */
    function _transfer(address from, address to, uint256 amount) internal virtual {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(from, to, amount);

        uint256 fromBalance = _balances[from];
        require(fromBalance >= amount, "ERC20: transfer amount exceeds balance");
        unchecked {
            _balances[from] = fromBalance - amount;
            // Overflow not possible: the sum of all balances is capped by totalSupply, and the sum is preserved by
            // decrementing then incrementing.
            _balances[to] += amount;
        }

        emit Transfer(from, to, amount);

        _afterTokenTransfer(from, to, amount);
    }

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply += amount;
        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            _balances[account] += amount;
        }
        emit Transfer(address(0), account, amount);

        _afterTokenTransfer(address(0), account, amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            _balances[account] = accountBalance - amount;
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            _totalSupply -= amount;
        }

        emit Transfer(account, address(0), amount);

        _afterTokenTransfer(account, address(0), amount);
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @dev Updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(address owner, address spender, uint256 amount) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * will be transferred to `to`.
     * - when `from` is zero, `amount` tokens will be minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual {}

    /**
     * @dev Hook that is called after any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * has been transferred to `to`.
     * - when `from` is zero, `amount` tokens have been minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens have been burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _afterTokenTransfer(address from, address to, uint256 amount) internal virtual {}
}


// File @openzeppelin/contracts/utils/math/Math.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (utils/math/Math.sol)


/**
 * @dev Standard math utilities missing in the Solidity language.
 */
library Math {
    enum Rounding {
        Down, // Toward negative infinity
        Up, // Toward infinity
        Zero // Toward zero
    }

    /**
     * @dev Returns the largest of two numbers.
     */
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * @dev Returns the average of two numbers. The result is rounded towards
     * zero.
     */
    function average(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b) / 2 can overflow.
        return (a & b) + (a ^ b) / 2;
    }

    /**
     * @dev Returns the ceiling of the division of two numbers.
     *
     * This differs from standard division with `/` in that it rounds up instead
     * of rounding down.
     */
    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        // (a + b - 1) / b can overflow on addition, so we distribute.
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    /**
     * @notice Calculates floor(x * y / denominator) with full precision. Throws if result overflows a uint256 or denominator == 0
     * @dev Original credit to Remco Bloemen under MIT license (https://xn--2-umb.com/21/muldiv)
     * with further edits by Uniswap Labs also under MIT license.
     */
    function mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            // 512-bit multiply [prod1 prod0] = x * y. Compute the product mod 2^256 and mod 2^256 - 1, then use
            // use the Chinese Remainder Theorem to reconstruct the 512 bit result. The result is stored in two 256
            // variables such that product = prod1 * 2^256 + prod0.
            uint256 prod0; // Least significant 256 bits of the product
            uint256 prod1; // Most significant 256 bits of the product
            assembly {
                let mm := mulmod(x, y, not(0))
                prod0 := mul(x, y)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Handle non-overflow cases, 256 by 256 division.
            if (prod1 == 0) {
                // Solidity will revert if denominator == 0, unlike the div opcode on its own.
                // The surrounding unchecked block does not change this fact.
                // See https://docs.soliditylang.org/en/latest/control-structures.html#checked-or-unchecked-arithmetic.
                return prod0 / denominator;
            }

            // Make sure the result is less than 2^256. Also prevents denominator == 0.
            require(denominator > prod1, "Math: mulDiv overflow");

            ///////////////////////////////////////////////
            // 512 by 256 division.
            ///////////////////////////////////////////////

            // Make division exact by subtracting the remainder from [prod1 prod0].
            uint256 remainder;
            assembly {
                // Compute remainder using mulmod.
                remainder := mulmod(x, y, denominator)

                // Subtract 256 bit number from 512 bit number.
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor powers of two out of denominator and compute largest power of two divisor of denominator. Always >= 1.
            // See https://cs.stackexchange.com/q/138556/92363.

            // Does not overflow because the denominator cannot be zero at this stage in the function.
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                // Divide denominator by twos.
                denominator := div(denominator, twos)

                // Divide [prod1 prod0] by twos.
                prod0 := div(prod0, twos)

                // Flip twos such that it is 2^256 / twos. If twos is zero, then it becomes one.
                twos := add(div(sub(0, twos), twos), 1)
            }

            // Shift in bits from prod1 into prod0.
            prod0 |= prod1 * twos;

            // Invert denominator mod 2^256. Now that denominator is an odd number, it has an inverse modulo 2^256 such
            // that denominator * inv = 1 mod 2^256. Compute the inverse by starting with a seed that is correct for
            // four bits. That is, denominator * inv = 1 mod 2^4.
            uint256 inverse = (3 * denominator) ^ 2;

            // Use the Newton-Raphson iteration to improve the precision. Thanks to Hensel's lifting lemma, this also works
            // in modular arithmetic, doubling the correct bits in each step.
            inverse *= 2 - denominator * inverse; // inverse mod 2^8
            inverse *= 2 - denominator * inverse; // inverse mod 2^16
            inverse *= 2 - denominator * inverse; // inverse mod 2^32
            inverse *= 2 - denominator * inverse; // inverse mod 2^64
            inverse *= 2 - denominator * inverse; // inverse mod 2^128
            inverse *= 2 - denominator * inverse; // inverse mod 2^256

            // Because the division is now exact we can divide by multiplying with the modular inverse of denominator.
            // This will give us the correct result modulo 2^256. Since the preconditions guarantee that the outcome is
            // less than 2^256, this is the final result. We don't need to compute the high bits of the result and prod1
            // is no longer required.
            result = prod0 * inverse;
            return result;
        }
    }

    /**
     * @notice Calculates x * y / denominator with full precision, following the selected rounding direction.
     */
    function mulDiv(uint256 x, uint256 y, uint256 denominator, Rounding rounding) internal pure returns (uint256) {
        uint256 result = mulDiv(x, y, denominator);
        if (rounding == Rounding.Up && mulmod(x, y, denominator) > 0) {
            result += 1;
        }
        return result;
    }

    /**
     * @dev Returns the square root of a number. If the number is not a perfect square, the value is rounded down.
     *
     * Inspired by Henry S. Warren, Jr.'s "Hacker's Delight" (Chapter 11).
     */
    function sqrt(uint256 a) internal pure returns (uint256) {
        if (a == 0) {
            return 0;
        }

        // For our first guess, we get the biggest power of 2 which is smaller than the square root of the target.
        //
        // We know that the "msb" (most significant bit) of our target number `a` is a power of 2 such that we have
        // `msb(a) <= a < 2*msb(a)`. This value can be written `msb(a)=2**k` with `k=log2(a)`.
        //
        // This can be rewritten `2**log2(a) <= a < 2**(log2(a) + 1)`
        // → `sqrt(2**k) <= sqrt(a) < sqrt(2**(k+1))`
        // → `2**(k/2) <= sqrt(a) < 2**((k+1)/2) <= 2**(k/2 + 1)`
        //
        // Consequently, `2**(log2(a) / 2)` is a good first approximation of `sqrt(a)` with at least 1 correct bit.
        uint256 result = 1 << (log2(a) >> 1);

        // At this point `result` is an estimation with one bit of precision. We know the true value is a uint128,
        // since it is the square root of a uint256. Newton's method converges quadratically (precision doubles at
        // every iteration). We thus need at most 7 iteration to turn our partial result with one bit of precision
        // into the expected uint128 result.
        unchecked {
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            result = (result + a / result) >> 1;
            return min(result, a / result);
        }
    }

    /**
     * @notice Calculates sqrt(a), following the selected rounding direction.
     */
    function sqrt(uint256 a, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = sqrt(a);
            return result + (rounding == Rounding.Up && result * result < a ? 1 : 0);
        }
    }

    /**
     * @dev Return the log in base 2, rounded down, of a positive value.
     * Returns 0 if given 0.
     */
    function log2(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >> 128 > 0) {
                value >>= 128;
                result += 128;
            }
            if (value >> 64 > 0) {
                value >>= 64;
                result += 64;
            }
            if (value >> 32 > 0) {
                value >>= 32;
                result += 32;
            }
            if (value >> 16 > 0) {
                value >>= 16;
                result += 16;
            }
            if (value >> 8 > 0) {
                value >>= 8;
                result += 8;
            }
            if (value >> 4 > 0) {
                value >>= 4;
                result += 4;
            }
            if (value >> 2 > 0) {
                value >>= 2;
                result += 2;
            }
            if (value >> 1 > 0) {
                result += 1;
            }
        }
        return result;
    }

    /**
     * @dev Return the log in base 2, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log2(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log2(value);
            return result + (rounding == Rounding.Up && 1 << result < value ? 1 : 0);
        }
    }

    /**
     * @dev Return the log in base 10, rounded down, of a positive value.
     * Returns 0 if given 0.
     */
    function log10(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >= 10 ** 64) {
                value /= 10 ** 64;
                result += 64;
            }
            if (value >= 10 ** 32) {
                value /= 10 ** 32;
                result += 32;
            }
            if (value >= 10 ** 16) {
                value /= 10 ** 16;
                result += 16;
            }
            if (value >= 10 ** 8) {
                value /= 10 ** 8;
                result += 8;
            }
            if (value >= 10 ** 4) {
                value /= 10 ** 4;
                result += 4;
            }
            if (value >= 10 ** 2) {
                value /= 10 ** 2;
                result += 2;
            }
            if (value >= 10 ** 1) {
                result += 1;
            }
        }
        return result;
    }

    /**
     * @dev Return the log in base 10, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log10(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log10(value);
            return result + (rounding == Rounding.Up && 10 ** result < value ? 1 : 0);
        }
    }

    /**
     * @dev Return the log in base 256, rounded down, of a positive value.
     * Returns 0 if given 0.
     *
     * Adding one to the result gives the number of pairs of hex symbols needed to represent `value` as a hex string.
     */
    function log256(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >> 128 > 0) {
                value >>= 128;
                result += 16;
            }
            if (value >> 64 > 0) {
                value >>= 64;
                result += 8;
            }
            if (value >> 32 > 0) {
                value >>= 32;
                result += 4;
            }
            if (value >> 16 > 0) {
                value >>= 16;
                result += 2;
            }
            if (value >> 8 > 0) {
                result += 1;
            }
        }
        return result;
    }

    /**
     * @dev Return the log in base 256, following the selected rounding direction, of a positive value.
     * Returns 0 if given 0.
     */
    function log256(uint256 value, Rounding rounding) internal pure returns (uint256) {
        unchecked {
            uint256 result = log256(value);
            return result + (rounding == Rounding.Up && 1 << (result << 3) < value ? 1 : 0);
        }
    }
}


// File @openzeppelin/contracts/utils/StorageSlot.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.


/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(Address.isContract(newImplementation), "ERC1967: new implementation is not a contract");
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * _Available since v4.1 for `address`, `bool`, `bytes32`, `uint256`._
 * _Available since v4.9 for `string`, `bytes`._
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        /// @solidity memory-safe-assembly
        assembly {
            r.slot := store.slot
        }
    }
}


// File @openzeppelin/contracts/utils/Arrays.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (utils/Arrays.sol)


/**
 * @dev Collection of functions related to array types.
 */
library Arrays {
    using StorageSlot for bytes32;

    /**
     * @dev Searches a sorted `array` and returns the first index that contains
     * a value greater or equal to `element`. If no such index exists (i.e. all
     * values in the array are strictly less than `element`), the array length is
     * returned. Time complexity O(log n).
     *
     * `array` is expected to be sorted in ascending order, and to contain no
     * repeated elements.
     */
    function findUpperBound(uint256[] storage array, uint256 element) internal view returns (uint256) {
        if (array.length == 0) {
            return 0;
        }

        uint256 low = 0;
        uint256 high = array.length;

        while (low < high) {
            uint256 mid = Math.average(low, high);

            // Note that mid will always be strictly less than high (i.e. it will be a valid array index)
            // because Math.average rounds down (it does integer division with truncation).
            if (unsafeAccess(array, mid).value > element) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        // At this point `low` is the exclusive upper bound. We will return the inclusive upper bound.
        if (low > 0 && unsafeAccess(array, low - 1).value == element) {
            return low - 1;
        } else {
            return low;
        }
    }

    /**
     * @dev Access an array in an "unsafe" way. Skips solidity "index-out-of-range" check.
     *
     * WARNING: Only use if you are certain `pos` is lower than the array length.
     */
    function unsafeAccess(address[] storage arr, uint256 pos) internal pure returns (StorageSlot.AddressSlot storage) {
        bytes32 slot;
        // We use assembly to calculate the storage slot of the element at index `pos` of the dynamic array `arr`
        // following https://docs.soliditylang.org/en/v0.8.17/internals/layout_in_storage.html#mappings-and-dynamic-arrays.

        /// @solidity memory-safe-assembly
        assembly {
            mstore(0, arr.slot)
            slot := add(keccak256(0, 0x20), pos)
        }
        return slot.getAddressSlot();
    }

    /**
     * @dev Access an array in an "unsafe" way. Skips solidity "index-out-of-range" check.
     *
     * WARNING: Only use if you are certain `pos` is lower than the array length.
     */
    function unsafeAccess(bytes32[] storage arr, uint256 pos) internal pure returns (StorageSlot.Bytes32Slot storage) {
        bytes32 slot;
        // We use assembly to calculate the storage slot of the element at index `pos` of the dynamic array `arr`
        // following https://docs.soliditylang.org/en/v0.8.17/internals/layout_in_storage.html#mappings-and-dynamic-arrays.

        /// @solidity memory-safe-assembly
        assembly {
            mstore(0, arr.slot)
            slot := add(keccak256(0, 0x20), pos)
        }
        return slot.getBytes32Slot();
    }

    /**
     * @dev Access an array in an "unsafe" way. Skips solidity "index-out-of-range" check.
     *
     * WARNING: Only use if you are certain `pos` is lower than the array length.
     */
    function unsafeAccess(uint256[] storage arr, uint256 pos) internal pure returns (StorageSlot.Uint256Slot storage) {
        bytes32 slot;
        // We use assembly to calculate the storage slot of the element at index `pos` of the dynamic array `arr`
        // following https://docs.soliditylang.org/en/v0.8.17/internals/layout_in_storage.html#mappings-and-dynamic-arrays.

        /// @solidity memory-safe-assembly
        assembly {
            mstore(0, arr.slot)
            slot := add(keccak256(0, 0x20), pos)
        }
        return slot.getUint256Slot();
    }
}


// File @openzeppelin/contracts/utils/Counters.sol@v4.9.6

// OpenZeppelin Contracts v4.4.1 (utils/Counters.sol)


/**
 * @title Counters
 * @author Matt Condon (@shrugs)
 * @dev Provides counters that can only be incremented, decremented or reset. This can be used e.g. to track the number
 * of elements in a mapping, issuing ERC721 ids, or counting request ids.
 *
 * Include with `using Counters for Counters.Counter;`
 */
library Counters {
    struct Counter {
        // This variable should never be directly accessed by users of the library: interactions must be restricted to
        // the library's function. As of Solidity v0.5.2, this cannot be enforced, though there is a proposal to add
        // this feature: see https://github.com/ethereum/solidity/issues/4637
        uint256 _value; // default: 0
    }

    function current(Counter storage counter) internal view returns (uint256) {
        return counter._value;
    }

    function increment(Counter storage counter) internal {
        unchecked {
            counter._value += 1;
        }
    }

    function decrement(Counter storage counter) internal {
        uint256 value = counter._value;
        require(value > 0, "Counter: decrement overflow");
        unchecked {
            counter._value = value - 1;
        }
    }

    function reset(Counter storage counter) internal {
        counter._value = 0;
    }
}


// File @openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC20/extensions/ERC20Snapshot.sol)


/**
 * @dev This contract extends an ERC20 token with a snapshot mechanism. When a snapshot is created, the balances and
 * total supply at the time are recorded for later access.
 *
 * This can be used to safely create mechanisms based on token balances such as trustless dividends or weighted voting.
 * In naive implementations it's possible to perform a "double spend" attack by reusing the same balance from different
 * accounts. By using snapshots to calculate dividends or voting power, those attacks no longer apply. It can also be
 * used to create an efficient ERC20 forking mechanism.
 *
 * Snapshots are created by the internal {_snapshot} function, which will emit the {Snapshot} event and return a
 * snapshot id. To get the total supply at the time of a snapshot, call the function {totalSupplyAt} with the snapshot
 * id. To get the balance of an account at the time of a snapshot, call the {balanceOfAt} function with the snapshot id
 * and the account address.
 *
 * NOTE: Snapshot policy can be customized by overriding the {_getCurrentSnapshotId} method. For example, having it
 * return `block.number` will trigger the creation of snapshot at the beginning of each new block. When overriding this
 * function, be careful about the monotonicity of its result. Non-monotonic snapshot ids will break the contract.
 *
 * Implementing snapshots for every block using this method will incur significant gas costs. For a gas-efficient
 * alternative consider {ERC20Votes}.
 *
 * ==== Gas Costs
 *
 * Snapshots are efficient. Snapshot creation is _O(1)_. Retrieval of balances or total supply from a snapshot is _O(log
 * n)_ in the number of snapshots that have been created, although _n_ for a specific account will generally be much
 * smaller since identical balances in subsequent snapshots are stored as a single entry.
 *
 * There is a constant overhead for normal ERC20 transfers due to the additional snapshot bookkeeping. This overhead is
 * only significant for the first transfer that immediately follows a snapshot for a particular account. Subsequent
 * transfers will have normal cost until the next snapshot, and so on.
 */

abstract contract ERC20Snapshot is ERC20 {
    // Inspired by Jordi Baylina's MiniMeToken to record historical balances:
    // https://github.com/Giveth/minime/blob/ea04d950eea153a04c51fa510b068b9dded390cb/contracts/MiniMeToken.sol

    using Arrays for uint256[];
    using Counters for Counters.Counter;

    // Snapshotted values have arrays of ids and the value corresponding to that id. These could be an array of a
    // Snapshot struct, but that would impede usage of functions that work on an array.
    struct Snapshots {
        uint256[] ids;
        uint256[] values;
    }

    mapping(address => Snapshots) private _accountBalanceSnapshots;
    Snapshots private _totalSupplySnapshots;

    // Snapshot ids increase monotonically, with the first value being 1. An id of 0 is invalid.
    Counters.Counter private _currentSnapshotId;

    /**
     * @dev Emitted by {_snapshot} when a snapshot identified by `id` is created.
     */
    event Snapshot(uint256 id);

    /**
     * @dev Creates a new snapshot and returns its snapshot id.
     *
     * Emits a {Snapshot} event that contains the same id.
     *
     * {_snapshot} is `internal` and you have to decide how to expose it externally. Its usage may be restricted to a
     * set of accounts, for example using {AccessControl}, or it may be open to the public.
     *
     * [WARNING]
     * ====
     * While an open way of calling {_snapshot} is required for certain trust minimization mechanisms such as forking,
     * you must consider that it can potentially be used by attackers in two ways.
     *
     * First, it can be used to increase the cost of retrieval of values from snapshots, although it will grow
     * logarithmically thus rendering this attack ineffective in the long term. Second, it can be used to target
     * specific accounts and increase the cost of ERC20 transfers for them, in the ways specified in the Gas Costs
     * section above.
     *
     * We haven't measured the actual numbers; if this is something you're interested in please reach out to us.
     * ====
     */
    function _snapshot() internal virtual returns (uint256) {
        _currentSnapshotId.increment();

        uint256 currentId = _getCurrentSnapshotId();
        emit Snapshot(currentId);
        return currentId;
    }

    /**
     * @dev Get the current snapshotId
     */
    function _getCurrentSnapshotId() internal view virtual returns (uint256) {
        return _currentSnapshotId.current();
    }

    /**
     * @dev Retrieves the balance of `account` at the time `snapshotId` was created.
     */
    function balanceOfAt(address account, uint256 snapshotId) public view virtual returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _accountBalanceSnapshots[account]);

        return snapshotted ? value : balanceOf(account);
    }

    /**
     * @dev Retrieves the total supply at the time `snapshotId` was created.
     */
    function totalSupplyAt(uint256 snapshotId) public view virtual returns (uint256) {
        (bool snapshotted, uint256 value) = _valueAt(snapshotId, _totalSupplySnapshots);

        return snapshotted ? value : totalSupply();
    }

    // Update balance and/or total supply snapshots before the values are modified. This is implemented
    // in the _beforeTokenTransfer hook, which is executed for _mint, _burn, and _transfer operations.
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (from == address(0)) {
            // mint
            _updateAccountSnapshot(to);
            _updateTotalSupplySnapshot();
        } else if (to == address(0)) {
            // burn
            _updateAccountSnapshot(from);
            _updateTotalSupplySnapshot();
        } else {
            // transfer
            _updateAccountSnapshot(from);
            _updateAccountSnapshot(to);
        }
    }

    function _valueAt(uint256 snapshotId, Snapshots storage snapshots) private view returns (bool, uint256) {
        require(snapshotId > 0, "ERC20Snapshot: id is 0");
        require(snapshotId <= _getCurrentSnapshotId(), "ERC20Snapshot: nonexistent id");

        // When a valid snapshot is queried, there are three possibilities:
        //  a) The queried value was not modified after the snapshot was taken. Therefore, a snapshot entry was never
        //  created for this id, and all stored snapshot ids are smaller than the requested one. The value that corresponds
        //  to this id is the current one.
        //  b) The queried value was modified after the snapshot was taken. Therefore, there will be an entry with the
        //  requested id, and its value is the one to return.
        //  c) More snapshots were created after the requested one, and the queried value was later modified. There will be
        //  no entry for the requested id: the value that corresponds to it is that of the smallest snapshot id that is
        //  larger than the requested one.
        //
        // In summary, we need to find an element in an array, returning the index of the smallest value that is larger if
        // it is not found, unless said value doesn't exist (e.g. when all values are smaller). Arrays.findUpperBound does
        // exactly this.

        uint256 index = snapshots.ids.findUpperBound(snapshotId);

        if (index == snapshots.ids.length) {
            return (false, 0);
        } else {
            return (true, snapshots.values[index]);
        }
    }

    function _updateAccountSnapshot(address account) private {
        _updateSnapshot(_accountBalanceSnapshots[account], balanceOf(account));
    }

    function _updateTotalSupplySnapshot() private {
        _updateSnapshot(_totalSupplySnapshots, totalSupply());
    }

    function _updateSnapshot(Snapshots storage snapshots, uint256 currentValue) private {
        uint256 currentId = _getCurrentSnapshotId();
        if (_lastSnapshotId(snapshots.ids) < currentId) {
            snapshots.ids.push(currentId);
            snapshots.values.push(currentValue);
        }
    }

    function _lastSnapshotId(uint256[] storage ids) private view returns (uint256) {
        if (ids.length == 0) {
            return 0;
        } else {
            return ids[ids.length - 1];
        }
    }
}


// File @openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.4) (token/ERC20/extensions/IERC20Permit.sol)


/**
 * @dev Interface of the ERC20 Permit extension allowing approvals to be made via signatures, as defined in
 * https://eips.ethereum.org/EIPS/eip-2612[EIP-2612].
 *
 * Adds the {permit} method, which can be used to change an account's ERC20 allowance (see {IERC20-allowance}) by
 * presenting a message signed by the account. By not relying on {IERC20-approve}, the token holder account doesn't
 * need to send a transaction, and thus is not required to hold Ether at all.
 *
 * ==== Security Considerations
 *
 * There are two important considerations concerning the use of `permit`. The first is that a valid permit signature
 * expresses an allowance, and it should not be assumed to convey additional meaning. In particular, it should not be
 * considered as an intention to spend the allowance in any specific way. The second is that because permits have
 * built-in replay protection and can be submitted by anyone, they can be frontrun. A protocol that uses permits should
 * take this into consideration and allow a `permit` call to fail. Combining these two aspects, a pattern that may be
 * generally recommended is:
 *
 * ```solidity
 * function doThingWithPermit(..., uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public {
 *     try token.permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
 *     doThing(..., value);
 * }
 *
 * function doThing(..., uint256 value) public {
 *     token.safeTransferFrom(msg.sender, address(this), value);
 *     ...
 * }
 * ```
 *
 * Observe that: 1) `msg.sender` is used as the owner, leaving no ambiguity as to the signer intent, and 2) the use of
 * `try/catch` allows the permit to fail and makes the code tolerant to frontrunning. (See also
 * {SafeERC20-safeTransferFrom}).
 *
 * Additionally, note that smart contract wallets (such as Argent or Safe) are not able to produce permit signatures, so
 * contracts should have entry points that don't rely on permit.
 */
interface IERC20Permit {
    /**
     * @dev Sets `value` as the allowance of `spender` over ``owner``'s tokens,
     * given ``owner``'s signed approval.
     *
     * IMPORTANT: The same issues {IERC20-approve} has related to transaction
     * ordering also apply here.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
     * over the EIP712-formatted function arguments.
     * - the signature must use ``owner``'s current nonce (see {nonces}).
     *
     * For more information on the signature format, see the
     * https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
     * section].
     *
     * CAUTION: See Security Considerations above.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for {permit}.
     *
     * Every successful call to {permit} increases ``owner``'s nonce by one. This
     * prevents a signature from being used multiple times.
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}


// File @openzeppelin/contracts/utils/Address.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (utils/Address.sol)


/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     *
     * Furthermore, `isContract` will also return true if the target contract within
     * the same transaction is already scheduled for destruction by `SELFDESTRUCT`,
     * which only has an effect at the end of a transaction.
     * ====
     *
     * [IMPORTANT]
     * ====
     * You shouldn't rely on `isContract` to protect against flash loan attacks!
     *
     * Preventing calls from contracts is highly discouraged. It breaks composability, breaks support for smart wallets
     * like Gnosis Safe, and does not provide security since it can be circumvented by calling from a contract
     * constructor.
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize/address.code.length, which returns 0
        // for contracts in construction, since the code is only stored at the end
        // of the constructor execution.

        return account.code.length > 0;
    }

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.0/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason, it is bubbled up by this
     * function (like regular Solidity function calls).
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     *
     * _Available since v3.1._
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, "Address: low-level call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`], but with
     * `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    /**
     * @dev Same as {xref-Address-functionCallWithValue-address-bytes-uint256-}[`functionCallWithValue`], but
     * with `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        return functionStaticCall(target, data, "Address: low-level static call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionDelegateCall(target, data, "Address: low-level delegate call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and revert (either by bubbling
     * the revert reason or using the provided one) in case of unsuccessful call or if target was not a contract.
     *
     * _Available since v4.8._
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        if (success) {
            if (returndata.length == 0) {
                // only check isContract if the call was successful and the return data is empty
                // otherwise we already know that it was a contract
                require(isContract(target), "Address: call to non-contract");
            }
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and revert if it wasn't, either by bubbling the
     * revert reason or using the provided one.
     *
     * _Available since v4.3._
     */
    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    function _revert(bytes memory returndata, string memory errorMessage) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert(errorMessage);
        }
    }
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.3) (token/ERC20/utils/SafeERC20.sol)


/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using Address for address;

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    /**
     * @dev Deprecated. This function has issues similar to the ones found in
     * {IERC20-approve}, and its usage is discouraged.
     *
     * Whenever possible, use {safeIncreaseAllowance} and
     * {safeDecreaseAllowance} instead.
     */
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        // safeApprove should only be called when setting an initial allowance,
        // or when resetting it to zero. To increase and decrease it, use
        // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance + value));
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        unchecked {
            uint256 oldAllowance = token.allowance(address(this), spender);
            require(oldAllowance >= value, "SafeERC20: decreased allowance below zero");
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance - value));
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeWithSelector(token.approve.selector, spender, value);

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, 0));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Use a ERC-2612 signature to set the `owner` approval toward `spender` on `token`.
     * Revert on invalid signature.
     */
    function safePermit(
        IERC20Permit token,
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        uint256 nonceBefore = token.nonces(owner);
        token.permit(owner, spender, value, deadline, v, r, s);
        uint256 nonceAfter = token.nonces(owner);
        require(nonceAfter == nonceBefore + 1, "SafeERC20: permit did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We use {Address-functionCall} to perform this call, which verifies that
        // the target address contains contract code and also asserts for success in the low-level call.

        bytes memory returndata = address(token).functionCall(data, "SafeERC20: low-level call failed");
        require(returndata.length == 0 || abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silents catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We cannot use {Address-functionCall} here since this should return false
        // and not revert is the subcall reverts.

        (bool success, bytes memory returndata) = address(token).call(data);
        return
            success && (returndata.length == 0 || abi.decode(returndata, (bool))) && Address.isContract(address(token));
    }
}


// File @openzeppelin/contracts/security/ReentrancyGuard.sol@v4.9.6

// OpenZeppelin Contracts (last updated v4.9.0) (security/ReentrancyGuard.sol)


/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be _NOT_ENTERED
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == _ENTERED;
    }
}


// File contracts/security-token/EasyAccessControl.sol


contract EasyAccessControl {

  // ---------------------------------------------------------------
  //  Custom Errors (gas optimization: ~200 gas cheaper than require strings)
  // ---------------------------------------------------------------
  error ZeroAddress();
  error InvalidRole();
  error DoesNotHaveContractAdminRole();
  error DoesNotHaveTransferAdminRole();
  error DoesNotHaveWalletsAdminRole();
  error DoesNotHaveReserveAdminRole();
  error DoesNotHaveWalletsOrReserveAdminRole();
  error AddressLacksSpecifiedRoles();
  error MustHaveAtLeastOneContractAdmin();

  // ---------------------------------------------------------------
  //  Constants (gas optimization: constants are inlined by the compiler)
  // ---------------------------------------------------------------
  uint8 internal constant CONTRACT_ADMIN_ROLE = 1; // 0001
  uint8 internal constant RESERVE_ADMIN_ROLE = 2;  // 0010
  uint8 internal constant WALLETS_ADMIN_ROLE = 4;  // 0100
  uint8 internal constant TRANSFER_ADMIN_ROLE = 8; // 1000

  // Gas optimization: constant for the valid role mask avoids recomputation
  uint8 private constant VALID_ROLE_MASK = 15;

  event RoleChange(address indexed grantor, address indexed grantee, uint8 role, bool indexed status);

  mapping (address => uint8) admins; // address => binary roles

  uint8 public contractAdminCount; // counter of contract admins to keep at least one

  modifier validAddress(address addr) {
    if (addr == address(0)) revert ZeroAddress();
    _;
  }

  modifier validRole(uint8 role) {
    // Gas optimization: single comparison instead of two separate checks
    if (role == 0 || role | VALID_ROLE_MASK != VALID_ROLE_MASK) revert InvalidRole();
    _;
  }

  modifier onlyContractAdmin() {
    if (!hasRole(msg.sender, CONTRACT_ADMIN_ROLE)) revert DoesNotHaveContractAdminRole();
    _;
  }

  modifier onlyTransferAdmin() {
    if (!hasRole(msg.sender, TRANSFER_ADMIN_ROLE)) revert DoesNotHaveTransferAdminRole();
    _;
  }

  modifier onlyWalletsAdmin() {
    if (!hasRole(msg.sender, WALLETS_ADMIN_ROLE)) revert DoesNotHaveWalletsAdminRole();
    _;
  }

  modifier onlyReserveAdmin() {
    if (!hasRole(msg.sender, RESERVE_ADMIN_ROLE)) revert DoesNotHaveReserveAdminRole();
    _;
  }

  /**
    @notice Grant role/roles to address use role bitmask
    @param addr to grant role
    @param role bitmask of role/roles to grant
  **/
  function grantRole(address addr, uint8 role) public validRole(role) validAddress(addr) onlyContractAdmin  {
    if ( admins[addr] & CONTRACT_ADMIN_ROLE == 0 && role & CONTRACT_ADMIN_ROLE > 0 ) contractAdminCount++;
    admins[addr] |= role;
    emit RoleChange(msg.sender, addr, role, true);
  }

  /**
    @notice Revoke role/roles from address use role bitmask
    @param addr to revoke role
    @param role bitmask of role/roles to revoke
  **/
  function revokeRole(address addr, uint8 role) public validRole(role) validAddress(addr) onlyContractAdmin  {
    if ((admins[addr] & role) != role) revert AddressLacksSpecifiedRoles();
    if ( role & CONTRACT_ADMIN_ROLE > 0 ) {
      if (contractAdminCount <= 1) revert MustHaveAtLeastOneContractAdmin();
      contractAdminCount--;
    }
    admins[addr] &= ~role;
    emit RoleChange(msg.sender, addr, role, false);
  }

  /**
    @notice Check role/roles availability at address
    @param addr to revoke role
    @param role bitmask of role/roles to revoke
    @return bool true or false
  **/
  function hasRole(address addr, uint8 role) public view validRole(role) validAddress(addr) returns (bool) {
    return admins[addr] & role > 0;
  }
}


// File contracts/security-token/interfaces/ITransferRules.sol


interface ITransferRules {
    /// @notice Detects if a transfer will be reverted and if so returns an appropriate reference code
    /// @param from Sending address
    /// @param to Receiving address
    /// @param value Amount of tokens being transferred
    /// @return Code by which to reference message for rejection reasoning
    function detectTransferRestriction(
        address token,
        address from,
        address to,
        uint256 value
    ) external view returns (uint8);

    /// @notice Returns a human-readable message for a given restriction code
    /// @param restrictionCode Identifier for looking up a message
    /// @return Text showing the restriction's reasoning
    function messageForTransferRestriction(uint8 restrictionCode)
        external
        view
        returns (string memory);

    function checkSuccess(uint8 restrictionCode) external view returns (bool);
}


// File contracts/security-token/RestrictedLockupToken.sol


contract RestrictedLockupToken is ERC20Snapshot, EasyAccessControl, ReentrancyGuard {

  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------
  //  Custom Errors (gas optimization: ~200 gas cheaper per revert than require strings)
  // ---------------------------------------------------------------
  error TransferRulesZeroAddress();
  error TokenOwnerZeroAddress();
  error TokenReserveAdminZeroAddress();
  error MinTimelockMustBePositive();
  error FirstReleaseExceedsMax();
  error LessThanOneRelease();
  error ReleaseExceeds100Percent();
  error PeriodMustBePositive();
  error ReleasedLessThan100Percent();
  error MaxCancelableByExceeded();
  error AmountBelowMinFunding();
  error RecipientZeroAddress();
  error InvalidScheduleId();
  error LessThanOneTokenPerRelease();
  error InitialReleaseOutOfRange();
  error InvalidTimelockIndex();
  error InvalidReclaimAddress();
  error NotAllowedToCancelTimelock();
  error ScheduleIdMismatch();
  error CommencementTimestampMismatch();
  error TotalAmountMismatch();
  error TimelockHasNoValueLeft();
  error InsufficientTokens();
  error AmountExceedsUnlocked();
  error RecipientAddressZero();
  error SenderOrRecipientAddressZero();
  error AllowanceTooLow();
  error InsufficientTokensToBurn();
  error ExceedsMaxTotalSupply();
  error CannotApproveFromNonZero();
  error TransferRulesAddressZero();

  // ---------------------------------------------------------------
  //  Structs
  //  Gas optimization: ReleaseSchedule fields remain uint256 because they are used
  //  in arithmetic with other uint256 values. Packing would cost extra expansion gas.
  // ---------------------------------------------------------------
  struct ReleaseSchedule {
    uint releaseCount;
    uint delayUntilFirstReleaseInSeconds;
    uint initialReleasePortionInBips;
    uint periodBetweenReleasesInSeconds;
  }

  struct Timelock {
    uint scheduleId;
    uint commencementTimestamp;
    uint tokensTransferred;
    uint totalAmount;
    address[] cancelableBy; // not cancelable unless set at the time of funding
  }

  ReleaseSchedule[] public releaseSchedules;

  // Gas optimization: immutable variables are stored in bytecode, not storage (saves ~2100 gas SLOAD)
  uint immutable public minTimelockAmount;
  uint immutable public maxReleaseDelay;

  // Gas optimization: constant is inlined at compile time (zero storage reads)
  uint private constant BIPS_PRECISION = 10000;

  mapping(address => Timelock[]) public timelocks;
  mapping(address => uint) internal _totalTokensUnlocked;

  event ScheduleCreated(address indexed from, uint indexed scheduleId);

  event ScheduleFunded(
    address indexed from,
    address indexed to,
    uint indexed scheduleId,
    uint amount,
    uint commencementTimestamp,
    uint timelockId,
    address[] cancelableBy
  );

  event TimelockCanceled(
    address indexed canceledBy,
    address indexed target,
    uint indexed timelockIndex,
    address relaimTokenTo,
    uint canceledAmount,
    uint paidAmount
  );

  uint8 public _decimals;

  ITransferRules public transferRules;

  uint256 public maxTotalSupply;

  // Transfer restriction "eternal storage" mappings that can be used by future TransferRules contract upgrades
  // They are accessed through getter and setter methods
  mapping(address => uint256) private _maxBalances;
  mapping(address => uint256) private _transferGroups; // restricted groups like Reg D Accredited US, Reg CF Unaccredited US and Reg S Foreign

  mapping(uint256 => mapping(uint256 => uint256)) private _allowGroupTransfers; // approve transfers between groups: from => to => TimeLockUntil

  mapping(address => bool) private _frozenAddresses;

  bool public isPaused = false;

  event AddressMaxBalance(address indexed admin, address indexed addr, uint256 indexed value);

  event AddressTransferGroup(address indexed admin, address indexed addr, uint256 indexed value);
  event AddressFrozen(address indexed admin, address indexed addr, bool indexed status);
  event AllowGroupTransfer(address indexed admin, uint256 indexed fromGroup, uint256 indexed toGroup, uint256 lockedUntil);

  event Pause(address admin, bool status);
  event Upgrade(address admin, address oldRules, address newRules);

  /**
    @dev Configure deployment for a specific token with release schedule security parameters
    @dev The symbol should end with " Unlock" & be less than 11 characters for MetaMask "custom token" compatibility
  */
  constructor (
    address transferRules_,
    address contractAdmin_,
    address tokenReserveAdmin_,
    string memory symbol_,
    string memory name_,
    uint8 decimals_,
    uint256 totalSupply_,
    uint256 maxTotalSupply_,
    uint _minTimelockAmount,
    uint _maxReleaseDelay
  ) ERC20(name_, symbol_) ReentrancyGuard() {
    // Gas optimization: custom errors instead of require strings
    if (transferRules_ == address(0)) revert TransferRulesZeroAddress();
    if (contractAdmin_ == address(0)) revert TokenOwnerZeroAddress();
    if (tokenReserveAdmin_ == address(0)) revert TokenReserveAdminZeroAddress();

    // Transfer rules can be swapped out for a new contract inheriting from the ITransferRules interface
    transferRules = ITransferRules(transferRules_);
    _decimals = decimals_;
    maxTotalSupply = maxTotalSupply_;

    admins[contractAdmin_] = CONTRACT_ADMIN_ROLE;
    contractAdminCount = 1;

    admins[tokenReserveAdmin_] |= RESERVE_ADMIN_ROLE;

    _mint(tokenReserveAdmin_, totalSupply_);

    // Token Lockup
    if (_minTimelockAmount == 0) revert MinTimelockMustBePositive();
    minTimelockAmount = _minTimelockAmount;
    maxReleaseDelay = _maxReleaseDelay;
  }

  modifier onlyWalletsAdminOrReserveAdmin() {
    if (!(hasRole(msg.sender, WALLETS_ADMIN_ROLE) || hasRole(msg.sender, RESERVE_ADMIN_ROLE)))
      revert DoesNotHaveWalletsOrReserveAdminRole();
    _;
  }

  function decimals() public view virtual override returns (uint8) {
    return _decimals;
  }

  // Create new snapshot
  function snapshot() external onlyContractAdmin returns (uint256)  {
    return _snapshot();
  }

  // Get current snapshot ID
  function getCurrentSnapshotId() view external returns (uint256) {
    return _getCurrentSnapshotId();
  }

  /// @dev Sets the maximum number of tokens an address will be allowed to hold.
  /// Addresses can hold 0 tokens by default.
  /// @param addr The address to restrict
  /// @param updatedValue the maximum number of tokens the address can hold
  function setMaxBalance(address addr, uint256 updatedValue) public validAddress(addr) onlyWalletsAdmin {
    _maxBalances[addr] = updatedValue;
    emit AddressMaxBalance(msg.sender, addr, updatedValue);
  }

  /// @dev Gets the maximum number of tokens an address is allowed to hold
  /// @param addr The address to check restrictions for
  function getMaxBalance(address addr) external view returns (uint256) {
    return _maxBalances[addr];
  }

  /**
    @notice Create a release schedule template that can be used to generate many token timelocks
    @param releaseCount Total number of releases including any initial "cliff'
    @param delayUntilFirstReleaseInSeconds "cliff" or 0 for immediate release
    @param initialReleasePortionInBips Portion to release in 100ths of 1% (10000 BIPS per 100%)
    @param periodBetweenReleasesInSeconds After the delay and initial release
        the remaining tokens will be distributed evenly across the remaining number of releases (releaseCount - 1)
    @return unlockScheduleId The id used to refer to the release schedule at the time of funding the schedule
  */
  function createReleaseSchedule(
    uint releaseCount,
    uint delayUntilFirstReleaseInSeconds,
    uint initialReleasePortionInBips,
    uint periodBetweenReleasesInSeconds
  ) external returns (uint unlockScheduleId) {
    // Gas optimization: custom errors instead of require strings
    if (delayUntilFirstReleaseInSeconds > maxReleaseDelay) revert FirstReleaseExceedsMax();
    if (releaseCount < 1) revert LessThanOneRelease();
    if (initialReleasePortionInBips > BIPS_PRECISION) revert ReleaseExceeds100Percent();

    if (releaseCount > 1) {
      if (periodBetweenReleasesInSeconds == 0) revert PeriodMustBePositive();
    } else if (releaseCount == 1) {
      if (initialReleasePortionInBips != BIPS_PRECISION) revert ReleasedLessThan100Percent();
    }

    releaseSchedules.push(ReleaseSchedule(
        releaseCount,
        delayUntilFirstReleaseInSeconds,
        initialReleasePortionInBips,
        periodBetweenReleasesInSeconds
      ));

    // Gas optimization: unchecked subtraction is safe because we just pushed, so length >= 1
    unchecked {
      unlockScheduleId = releaseSchedules.length - 1;
    }
    emit ScheduleCreated(msg.sender, unlockScheduleId);

    return unlockScheduleId;
  }

  /**
    @notice Fund the programmatic release of tokens to a recipient.
        WARNING: this function IS CANCELABLE by cancelableBy.
        If canceled the tokens that are locked at the time of the cancellation will be returned to the funder
        and unlocked tokens will be transferred to the recipient.
    @param to recipient address that will have tokens unlocked on a release schedule
    @param amount of tokens to transfer in base units (the smallest unit without the decimal point)
    @param commencementTimestamp the time the release schedule will start
    @param scheduleId the id of the release schedule that will be used to release the tokens
    @param cancelableBy array of canceler addresses
    @return success Always returns true on completion so that a function calling it can revert if the required call did not succeed
  */
  function fundReleaseSchedule(
    address to,
    uint amount,
    uint commencementTimestamp, // unix timestamp
    uint scheduleId,
    // Gas optimization: calldata instead of memory for read-only array parameter
    address[] memory cancelableBy
  ) public nonReentrant returns (bool success) {
    if (cancelableBy.length > 10) revert MaxCancelableByExceeded();

    uint timelockId = _fund(to, amount, commencementTimestamp, scheduleId);

    if (cancelableBy.length > 0) {
      timelocks[to][timelockId].cancelableBy = cancelableBy;
    }

    emit ScheduleFunded(msg.sender, to, scheduleId, amount, commencementTimestamp, timelockId, cancelableBy);
    return true;
  }


  function _fund(
    address to,
    uint amount,
    uint commencementTimestamp, // unix timestamp
    uint scheduleId)
  internal returns (uint) {
    if (amount < minTimelockAmount) revert AmountBelowMinFunding();
    if (to == address(0)) revert RecipientZeroAddress();
    if (scheduleId >= releaseSchedules.length) revert InvalidScheduleId();

    // Gas optimization: cache storage read to avoid repeated SLOAD
    ReleaseSchedule memory schedule = releaseSchedules[scheduleId];
    if (amount < schedule.releaseCount) revert LessThanOneTokenPerRelease();

    _transfer(address(this), amount);

    if (
      commencementTimestamp + schedule.delayUntilFirstReleaseInSeconds >
      block.timestamp + maxReleaseDelay
    ) revert InitialReleaseOutOfRange();

    Timelock memory timelock;
    timelock.scheduleId = scheduleId;
    timelock.commencementTimestamp = commencementTimestamp;
    timelock.totalAmount = amount;

    timelocks[to].push(timelock);

    // Gas optimization: unchecked subtraction, length >= 1 after push
    unchecked {
      return timelocks[to].length - 1;
    }
  }

  /**
    @notice Cancel a cancelable timelock created by the fundReleaseSchedule function.
        WARNING: this function cannot cancel a release schedule created by fundReleaseSchedule
        If canceled the tokens that are locked at the time of the cancellation will be returned to the funder
        and unlocked tokens will be transferred to the recipient.
    @param target The address that would receive the tokens when released from the timelock.
    @param timelockIndex timelock index
    @param scheduleId require it matches expected
    @param commencementTimestamp require it matches expected
    @param totalAmount require it matches expected
    @param reclaimTokenTo reclaim token to
    @return success Always returns true on completion so that a function calling it can revert if the required call did not succeed
  */
  function cancelTimelock(
    address target,
    uint timelockIndex,
    uint scheduleId,
    uint commencementTimestamp,
    uint totalAmount,
    address reclaimTokenTo
  ) public returns (bool success) {
    if (timelockCountOf(target) <= timelockIndex) revert InvalidTimelockIndex();
    if (reclaimTokenTo == address(0)) revert InvalidReclaimAddress();

    Timelock storage timelock = timelocks[target][timelockIndex];

    if (!_canBeCanceled(timelock)) revert NotAllowedToCancelTimelock();
    if (timelock.scheduleId != scheduleId) revert ScheduleIdMismatch();
    if (timelock.commencementTimestamp != commencementTimestamp) revert CommencementTimestampMismatch();
    if (timelock.totalAmount != totalAmount) revert TotalAmountMismatch();

    uint canceledAmount = lockedAmountOfTimelock(target, timelockIndex);

    if (canceledAmount == 0) revert TimelockHasNoValueLeft();

    uint paidAmount = unlockedAmountOfTimelock(target, timelockIndex);

    IERC20(this).safeTransfer(reclaimTokenTo, canceledAmount);
    IERC20(this).safeTransfer(target, paidAmount);

    emit TimelockCanceled(msg.sender, target, timelockIndex, reclaimTokenTo, canceledAmount, paidAmount);

    timelock.tokensTransferred = timelock.totalAmount;
    return true;
  }

  /**
   *  @notice Check if timelock can be cancelable by msg.sender
   *  Gas optimization: cached array length, unchecked loop counter
   */
  function _canBeCanceled(Timelock storage timelock) view private returns (bool){
    // Gas optimization: cache array length to avoid repeated SLOAD
    uint len = timelock.cancelableBy.length;
    for (uint i; i < len;) {
      if (msg.sender == timelock.cancelableBy[i]) {
        return true;
      }
      // Gas optimization: unchecked increment saves ~60 gas per iteration (no overflow possible)
      unchecked { ++i; }
    }
    return false;
  }

  /**
   *  @notice Batch version of fund cancelable release schedule
   *  @param to An array of recipient address that will have tokens unlocked on a release schedule
   *  @param amounts An array of amount of tokens to transfer in base units (the smallest unit without the decimal point)
   *  @param commencementTimestamps An array of the time the release schedule will start
   *  @param scheduleIds An array of the id of the release schedule that will be used to release the tokens
   *  @param cancelableBy An array of cancelables
   *  @return success Always returns true on completion so that a function calling it can revert if the required call did not succeed
   */
  function batchFundReleaseSchedule(
    address[] calldata to,
    uint[] calldata amounts,
    uint[] calldata commencementTimestamps,
    uint[] calldata scheduleIds,
    address[] calldata cancelableBy
  ) external returns (bool success) {
    // Gas optimization: cache array length for loop bound
    uint len = to.length;
    if (len != amounts.length) revert InsufficientTokens();
    if (len != commencementTimestamps.length) revert InsufficientTokens();
    if (len != scheduleIds.length) revert InsufficientTokens();

    for (uint i; i < len;) {
      require(fundReleaseSchedule(
          to[i],
          amounts[i],
          commencementTimestamps[i],
          scheduleIds[i],
          cancelableBy
        ));
      // Gas optimization: unchecked increment
      unchecked { ++i; }
    }

    return true;
  }
  /**
    @notice Get The locked balance for a specific address and specific timelock
    @param who The address to check
    @param timelockIndex Specific timelock belonging to the who address
    @return locked Balance of the timelock
    lockedBalanceOfTimelock
  */
  function lockedAmountOfTimelock(address who, uint timelockIndex) public view returns (uint locked) {
    Timelock memory timelock = timelockOf(who, timelockIndex);
    if (timelock.totalAmount <= timelock.tokensTransferred) {
      return 0;
    } else {
      // Gas optimization: unchecked subtraction, we verified totalAmount > tokensTransferred above
      // (the >= case returns 0, so in this branch totalAmount > tokensTransferred)
      // However totalUnlockedToDateOfTimelock can be <= totalAmount, so the subtraction is safe
      return timelock.totalAmount - totalUnlockedToDateOfTimelock(who, timelockIndex);
    }
  }

  /**
    @notice Get the unlocked balance for a specific address and specific timelock
    @param who the address to check
    @param timelockIndex for a specific timelock belonging to the who address
    @return unlocked balance of the timelock
    unlockedBalanceOfTimelock
  */
  function unlockedAmountOfTimelock(address who, uint timelockIndex) public view returns (uint unlocked) {
    Timelock memory timelock = timelockOf(who, timelockIndex);
    if (timelock.totalAmount <= timelock.tokensTransferred) {
      return 0;
    } else {
      // Gas optimization: unchecked subtraction, totalUnlockedToDate >= tokensTransferred by invariant
      unchecked {
        return totalUnlockedToDateOfTimelock(who, timelockIndex) - timelock.tokensTransferred;
      }
    }
  }

  /**
    @notice Check the total remaining balance of a timelock including the locked and unlocked portions
    @param who the address to check
    @param timelockIndex  Specific timelock belonging to the who address
    @return total remaining balance of a timelock
  */
  function balanceOfTimelock(address who, uint timelockIndex) external view returns (uint) {
    Timelock memory timelock = timelockOf(who, timelockIndex);
    if (timelock.totalAmount <= timelock.tokensTransferred) {
      return 0;
    } else {
      // Gas optimization: unchecked subtraction, verified totalAmount > tokensTransferred
      unchecked {
        return timelock.totalAmount - timelock.tokensTransferred;
      }
    }
  }

  /**
    @notice Gets the total locked and unlocked balance of a specific address's timelocks
    @param who The address to check
    @param timelockIndex The index of the timelock for the who address
    @return total Locked and unlocked amount for the specified timelock
  */
  function totalUnlockedToDateOfTimelock(address who, uint timelockIndex) public view returns (uint total) {
    Timelock memory _timelock = timelockOf(who, timelockIndex);

    return calculateUnlocked(
      _timelock.commencementTimestamp,
      block.timestamp,
      _timelock.totalAmount,
      _timelock.scheduleId
    );
  }

  /**
    @notice ERC20 standard interface function
          Provide controls of Restricted and Lockup tokens
          Can transfer simple ERC-20 tokens and unlocked tokens at the same time
          First will transfer unlocked tokens and then simple ERC-20
    @param recipient of transfer
    @param amount of tokens to transfer
    @return true On success / Reverted on error
  */
  function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
    if (recipient == address(0)) revert RecipientAddressZero();
    enforceTransferRestrictions(msg.sender, recipient, amount);
    return _transfer(recipient, amount);
  }

  function _transfer(address recipient, uint256 amount) private returns (bool) {
    uint256[2] memory values = validateTransfer(msg.sender, recipient, amount);
    // Gas optimization: unchecked addition is safe because both values are <= amount
    unchecked {
      if (values[0] + values[1] < amount) revert InsufficientTokens();
    }
    if (values[0] > 0) {// unlocked tokens
      super._transfer(address(this), recipient, values[0]);
    }
    if (values[1] > 0) {// simple tokens
      super._transfer(msg.sender, recipient, values[1]);
    }
    return true;
  }

  /**
    @notice ERC20 standard interface function
          Provide controls of Restricted and Lockup tokens
          Can transfer simple ERC-20 tokens and unlocked tokens at the same time
          First will transfer unlocked tokens and then simple ERC-20
    @param sender of transfer
    @param recipient of transfer
    @param amount of tokens to transfer
    @return true On success / Reverted on error
  */
  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) public virtual override returns (bool) {
    if (recipient == address(0) || sender == address(0)) revert SenderOrRecipientAddressZero();

    uint256 currentAllowance = allowance(sender, msg.sender);

    if (amount > currentAllowance) revert AllowanceTooLow();
    enforceTransferRestrictions(sender, recipient, amount);

    uint256[2] memory values = validateTransfer(sender, recipient, amount);
    // Gas optimization: unchecked addition
    unchecked {
      if (values[0] + values[1] < amount) revert InsufficientTokens();
    }

    if (values[0] > 0) { // unlocked tokens
      super._transfer(address(this), recipient, values[0]);

      // Decrease allowance
      unchecked {
        _approve(sender, msg.sender, currentAllowance - values[0]);
      }
    }

    if (values[1] > 0) { // simple tokens
      super.transferFrom(sender, recipient, values[1]);
    }
    return true;
  }

  /**
    @notice Balance of simple ERC20 tokens without any timelocks
    @param who Address to calculate
    @return amount The amount of simple ERC-20 tokens available
    token.balanceOf
  **/
  function tokensBalanceOf(address who) public view returns (uint256) {
    return super.balanceOf(who);
  }

  /**
    @notice Get The total available to transfer balance exclude timelocked
    @param who Address to calculate
    @return amount The total available amount
    no have original
  **/
  function unlockedBalanceOf(address who) public view returns (uint256) {
    return tokensBalanceOf(who) + unlockedAmountOf(who);
  }

  /**
    @notice Get The total balance of tokens (simple + locked + unlocked)
    @param who Address to calculate
    @return amount The total account balance amount
    no have original
  **/
  function balanceOf(address who) public view override returns (uint256) {
    return tokensBalanceOf(who) + unlockedAmountOf(who) + lockedAmountOf(who);
  }

  /**
    @notice Get The total locked balance of an address for all timelocks
    @param who Address to calculate
    @return amount The total locked amount of tokens for all of the who address's timelocks
    lockedBalanceOf
    Gas optimization: cached timelockCount to avoid repeated SLOAD, unchecked loop increment
  */
  function lockedAmountOf(address who) public view returns (uint amount) {
    // Gas optimization: cache the timelock count to avoid repeated storage access
    uint count = timelockCountOf(who);
    for (uint i; i < count;) {
      amount += lockedAmountOfTimelock(who, i);
      unchecked { ++i; }
    }
    return amount;
  }

  /**
    @notice Get The total unlocked balance of an address for all timelocks
    @param who Address to calculate
    @return amount The total unlocked amount of tokens for all of the who address's timelocks
    unlockedBalanceOf
    Gas optimization: cached timelockCount, unchecked loop increment
  */
  function unlockedAmountOf(address who) public view returns (uint amount) {
    // Gas optimization: cache the timelock count to avoid repeated storage access
    uint count = timelockCountOf(who);
    for (uint i; i < count;) {
      amount += unlockedAmountOfTimelock(who, i);
      unchecked { ++i; }
    }
    return amount;
  }

  /**
    @notice Get timelocked balance - used only in tests
    @param who Address to calculate
    @return Amount of the tokens used in timelocks (locked+unlocked)
    balanceOf
  **/
  function timelockBalanceOf(address who) public view returns (uint) {
    return unlockedAmountOf(who) + lockedAmountOf(who);
  }

  /**
    @notice Check and calculate the availability to transfer tokens between accounts from simple and timelock balances
    @param from Address from
    @param to Address to
    @param value Amount of tokens
    @return values Array of uint256[2] contains unlocked tokens at index 0, and simple ERC-20 at index 1 that can be used for transfer
    Gas optimization: cached timelockCount and unlockedAmountOfTimelock to avoid redundant calls,
    unchecked arithmetic where safe
  **/
  function validateTransfer(address from, address to, uint256 value) internal returns (uint256[2] memory values) {
    uint256 balance = tokensBalanceOf(from);
    uint256 unlockedBalance = unlockedAmountOf(from);

    if (balance + unlockedBalance < value) revert AmountExceedsUnlocked();

    uint remainingTransfer = value;

    // Gas optimization: cache timelockCount to avoid repeated storage reads
    uint count = timelockCountOf(from);

    // transfer from unlocked tokens
    for (uint i; i < count;) {
      // Gas optimization: cache storage reads to avoid repeated SLOAD on the same slot
      Timelock storage tl = timelocks[from][i];
      uint tlTokensTransferred = tl.tokensTransferred;
      uint tlTotalAmount = tl.totalAmount;

      // if the timelock has no value left
      if (tlTokensTransferred == tlTotalAmount) {
        unchecked { ++i; }
        continue;
      }

      // Gas optimization: compute unlockedAmount once instead of calling the view function
      // which itself loads from storage again
      uint totalUnlocked = calculateUnlocked(
        tl.commencementTimestamp,
        block.timestamp,
        tlTotalAmount,
        tl.scheduleId
      );
      // Safe because totalUnlocked >= tokensTransferred by invariant
      uint unlockedAmount;
      unchecked {
        unlockedAmount = totalUnlocked - tlTokensTransferred;
      }

      if (remainingTransfer > unlockedAmount) {
        // if the remainingTransfer is more than the unlocked balance use it all
        unchecked {
          remainingTransfer -= unlockedAmount;
        }
        tl.tokensTransferred = tlTokensTransferred + unlockedAmount;
      } else {
        // if the remainingTransfer is less than or equal to the unlocked balance
        // use part or all and exit the loop
        tl.tokensTransferred = tlTokensTransferred + remainingTransfer;
        remainingTransfer = 0;
        break;
      }
      unchecked { ++i; }
    }

    // Gas optimization: unchecked subtraction, remainingTransfer <= value
    unchecked {
      values[0] = value - remainingTransfer; // from unlockedValue
    }
    values[1] = remainingTransfer; // from balanceOf
  }

  /**
    @notice transfers the unlocked token from an address's specific timelock
        It is typically more convenient to call transfer. But if the account has many timelocks the cost of gas
        for calling transfer may be too high. Calling transferTimelock from a specific timelock limits the transfer cost.
    @param to the address that the tokens will be transferred to
    @param value the number of token base units to me transferred to the to address
    @param timelockId the specific timelock of the function caller to transfer unlocked tokens from
    @return bool always true when completed
  */
  function transferTimelock(address to, uint value, uint timelockId) public returns (bool) {
    if (unlockedAmountOfTimelock(msg.sender, timelockId) < value) revert AmountExceedsUnlocked();
    timelocks[msg.sender][timelockId].tokensTransferred += value;
    IERC20(this).safeTransfer(to, value);
    return true;
  }

  /**
    @notice calculates how many tokens would be released at a specified time for a scheduleId.
        This is independent of any specific address or address's timelock.
    @param commencedTimestamp the commencement time to use in the calculation for the scheduled
    @param currentTimestamp the timestamp to calculate unlocked tokens for
    @param amount the amount of tokens
    @param scheduleId the schedule id used to calculate the unlocked amount
    @return unlocked the total amount unlocked for the schedule given the other parameters
  */
  function calculateUnlocked(
    uint commencedTimestamp,
    uint currentTimestamp,
    uint amount,
    uint scheduleId
  ) public view returns (uint unlocked) {
    return calculateUnlocked(commencedTimestamp, currentTimestamp, amount, releaseSchedules[scheduleId]);
  }

  // @notice the total number of schedules that have been created
  function scheduleCount() external view returns (uint count) {
    return releaseSchedules.length;
  }

  /**
    @notice Get the struct details for an address's specific timelock
    @param who Address to check
    @param index The index of the timelock for the who address
    @return timelock Struct with the attributes of the timelock
  */
  function timelockOf(address who, uint index) public view returns (Timelock memory timelock) {
    return timelocks[who][index];
  }

  // @notice returns the total count of timelocks for a specific address
  function timelockCountOf(address who) public view returns (uint) {
    return timelocks[who].length;
  }

  /**
    @notice calculates how many tokens would be released at a specified time for a ReleaseSchedule struct.
            This is independent of any specific address or address's timelock.
    @param commencedTimestamp the commencement time to use in the calculation for the scheduled
    @param currentTimestamp the timestamp to calculate unlocked tokens for
    @param amount the amount of tokens
    @param releaseSchedule a ReleaseSchedule struct used to calculate the unlocked amount
    @return unlocked the total amount unlocked for the schedule given the other parameters
  */
  function calculateUnlocked(
    uint commencedTimestamp,
    uint currentTimestamp,
    uint amount,
    ReleaseSchedule memory releaseSchedule)
  public pure returns (uint unlocked) {
    return calculateUnlocked(
      commencedTimestamp,
      currentTimestamp,
      amount,
      releaseSchedule.releaseCount,
      releaseSchedule.delayUntilFirstReleaseInSeconds,
      releaseSchedule.initialReleasePortionInBips,
      releaseSchedule.periodBetweenReleasesInSeconds
    );
  }

  /**
    @notice The same functionality as above function with spread format of `releaseSchedule` arg
    @param commencedTimestamp the commencement time to use in the calculation for the scheduled
    @param currentTimestamp the timestamp to calculate unlocked tokens for
    @param amount the amount of tokens
    @param releaseCount Total number of releases including any initial "cliff'
    @param delayUntilFirstReleaseInSeconds "cliff" or 0 for immediate release
    @param initialReleasePortionInBips Portion to release in 100ths of 1% (10000 BIPS per 100%)
    @param periodBetweenReleasesInSeconds After the delay and initial release
    @return unlocked the total amount unlocked for the schedule given the other parameters
    Gas optimization: unchecked arithmetic in pure math where overflow is not possible
  */
  function calculateUnlocked(
    uint commencedTimestamp,
    uint currentTimestamp,
    uint amount,
    uint releaseCount,
    uint delayUntilFirstReleaseInSeconds,
    uint initialReleasePortionInBips,
    uint periodBetweenReleasesInSeconds
  ) public pure returns (uint unlocked) {
    if (commencedTimestamp > currentTimestamp) {
      return 0;
    }

    // Gas optimization: unchecked subtraction, we verified commencedTimestamp <= currentTimestamp
    uint secondsElapsed;
    unchecked {
      secondsElapsed = currentTimestamp - commencedTimestamp;
    }

    // return the full amount if the total lockup period has expired
    // unlocked amounts in each period are truncated and round down remainders smaller than the smallest unit
    // unlocking the full amount unlocks any remainder amounts in the final unlock period
    // this is done first to reduce computation
    // Gas optimization: unchecked arithmetic in period calculation (releaseCount >= 1 enforced at creation)
    unchecked {
      if (
        secondsElapsed >= delayUntilFirstReleaseInSeconds +
        (periodBetweenReleasesInSeconds * (releaseCount - 1))
      ) {
        return amount;
      }
    }

    // unlock the initial release if the delay has elapsed
    if (secondsElapsed >= delayUntilFirstReleaseInSeconds) {
      unlocked = (amount * initialReleasePortionInBips) / BIPS_PRECISION;

      // if at least one period after the delay has passed
      // Gas optimization: unchecked subtraction, secondsElapsed >= delayUntilFirstReleaseInSeconds
      unchecked {
        uint timeSinceFirstRelease = secondsElapsed - delayUntilFirstReleaseInSeconds;
        if (timeSinceFirstRelease >= periodBetweenReleasesInSeconds) {

          // calculate the number of additional periods that have passed (not including the initial release)
          uint additionalUnlockedPeriods = timeSinceFirstRelease / periodBetweenReleasesInSeconds;

          // calculate the amount of unlocked tokens for the additionalUnlockedPeriods
          // multiplication is applied before division to delay truncating to the smallest unit
          unlocked += ((amount - unlocked) * additionalUnlockedPeriods) / (releaseCount - 1);
        }
      }
    }

    return unlocked;
  }

  /// @dev Enforces transfer restrictions managed using the ERC-1404 standard functions.
  /// The TransferRules contract defines what the rules are. The data inputs to those rules remains in the RestrictedToken contract.
  /// TransferRules is a separate contract so its logic can be upgraded.
  /// @param from The address the tokens are transferred from
  /// @param to The address the tokens would be transferred to
  /// @param value the quantity of tokens to be transferred
  function enforceTransferRestrictions(address from, address to, uint256 value) public view {/*private*/
    uint8 restrictionCode = detectTransferRestriction(from, to, value);
    require(transferRules.checkSuccess(restrictionCode), messageForTransferRestriction(restrictionCode));
  }

  /// @dev Calls the TransferRules detectTransferRetriction function to determine if tokens can be transferred.
  /// detectTransferRestriction returns a status code.
  /// @param from The address the tokens are transferred from
  /// @param to The address the tokens would be transferred to
  /// @param value The quantity of tokens to be transferred
  function detectTransferRestriction(address from, address to, uint256 value) public view returns (uint8) {
    return transferRules.detectTransferRestriction(address(this), from, to, value);
  }

  /// @dev Calls TransferRules to lookup a human readable error message that goes with an error code.
  /// @param restrictionCode is an error code to lookup an error code for
  function messageForTransferRestriction(uint8 restrictionCode) public view returns (string memory) {
    return transferRules.messageForTransferRestriction(restrictionCode);
  }

  /// @dev Set the one group that the address belongs to, such as a US Reg CF investor group.
  /// @param addr The address to set the group for.
  /// @param groupID The uint256 numeric ID of the group.
  function setTransferGroup(address addr, uint256 groupID) public validAddress(addr) onlyWalletsAdmin {
    _transferGroups[addr] = groupID;
    emit AddressTransferGroup(msg.sender, addr, groupID);
  }

  /// @dev Gets the transfer group the address belongs to. The default group is 0.
  /// @param addr The address to check.
  /// @return groupID The group id of the address.
  function getTransferGroup(address addr) external view returns (uint256 groupID) {
    return _transferGroups[addr];
  }

  /// @dev Freezes or unfreezes an address.
  /// Tokens in a frozen address cannot be transferred from until the address is unfrozen.
  /// @param addr The address to be frozen.
  /// @param status The frozenAddress status of the address. True means frozen false means not frozen.
  function freeze(address addr, bool status) public validAddress(addr) onlyWalletsAdminOrReserveAdmin {
    _frozenAddresses[addr] = status;
    emit AddressFrozen(msg.sender, addr, status);
  }

  /// @dev Checks the status of an address to see if its frozen
  /// @param addr The address to check
  /// @return status Returns true if the address is frozen and false if its not frozen.
  function getFrozenStatus(address addr) external view returns (bool status) {
    return _frozenAddresses[addr];
  }

  /// @dev A convenience method for updating the transfer group, lock until, max balance, and freeze status.
  /// The convenience method also helps to reduce gas costs.
  /// @notice This function has different parameters count from original
  /// @param addr The address to set permissions for.
  /// @param groupID The ID of the address
  /// @param lockedBalanceUntil The amount of tokens to be reserved until the timelock expires. Reservation is exclusive.
  /// @param maxBalance Is the maximum number of tokens the account can hold.
  /// @param status The frozenAddress status of the address. True means frozen false means not frozen.
  function setAddressPermissions(address addr, uint256 groupID, uint256 lockedBalanceUntil,
    uint256 maxBalance, bool status) public validAddress(addr) onlyWalletsAdmin {
    setTransferGroup(addr, groupID);
    setMaxBalance(addr, maxBalance);
    freeze(addr, status);
  }

  /// @dev Sets an allowed transfer from a group to another group beginning at a specific time.
  /// There is only one definitive rule per from and to group.
  /// @param from The group the transfer is coming from.
  /// @param to The group the transfer is going to.
  /// @param lockedUntil The unix timestamp that the transfer is locked until. 0 is a special number. 0 means the transfer is not allowed.
  function setAllowGroupTransfer(uint256 from, uint256 to, uint256 lockedUntil) external onlyTransferAdmin {
    _allowGroupTransfers[from][to] = lockedUntil;
    emit AllowGroupTransfer(msg.sender, from, to, lockedUntil);
  }

  /// @dev Checks to see when a transfer between two addresses would be allowed.
  /// @param from The address the transfer is coming from
  /// @param to The address the transfer is going to
  /// @return timestamp The Unix timestamp of the time the transfer would be allowed. A 0 means never.
  function getAllowTransferTime(address from, address to) external view returns (uint timestamp) {
    return _allowGroupTransfers[_transferGroups[from]][_transferGroups[to]];
  }

  /// @dev Checks to see when a transfer between two groups would be allowed.
  /// @param from The group id the transfer is coming from
  /// @param to The group id the transfer is going to
  /// @return timestamp The Unix timestamp of the time the transfer would be allowed. A 0 means never.
  function getAllowGroupTransferTime(uint from, uint to) external view returns (uint timestamp) {
    return _allowGroupTransfers[from][to];
  }

  /// @dev Destroys tokens and removes them from the total supply. Can only be called by an address with a Reserve Admin role.
  /// @param from The address to destroy the tokens from.
  /// @param value The number of tokens to destroy from the address.
  function burn(address from, uint256 value) external validAddress(from) onlyReserveAdmin {
    if (value > balanceOf(from)) revert InsufficientTokensToBurn();
    _burn(from, value);
  }

  /// @dev Allows the reserve admin to create new tokens in a specified address.
  /// The total number of tokens cannot exceed the maxTotalSupply (the "Hard Cap").
  /// @param to The addres to mint tokens into.
  /// @param value The number of tokens to mint.
  function mint(address to, uint256 value) external validAddress(to) onlyReserveAdmin {
    if (totalSupply() + value > maxTotalSupply) revert ExceedsMaxTotalSupply();
    _mint(to, value);
  }

  /// @dev Allows the contract admin to pause transfers.
  function pause() external onlyContractAdmin() {
    isPaused = true;
    emit Pause(msg.sender, true);
  }

  /// @dev Allows the contract admin to unpause transfers.
  function unpause() external onlyContractAdmin() {
    isPaused = false;
    emit Pause(msg.sender, false);
  }

  /// @dev Allows the contrac admin to upgrade the transfer rules.
  /// The upgraded transfer rules must implement the ITransferRules interface which conforms to the ERC-1404 token standard.
  /// @param newTransferRules The address of the deployed TransferRules contract.
  function upgradeTransferRules(ITransferRules newTransferRules) external onlyTransferAdmin {
    if (address(newTransferRules) == address(0)) revert TransferRulesAddressZero();
    address oldRules = address(transferRules);
    transferRules = newTransferRules;
    emit Upgrade(msg.sender, oldRules, address(newTransferRules));
  }


  // @dev can delete, used only at tests
  function safeApprove(address spender, uint256 value) public {
    // safeApprove should only be called when setting an initial allowance,
    // or when resetting it to zero. To increase and decrease it, use
    // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
    if (!((value == 0) || (allowance(address(msg.sender), spender) == 0)))
      revert CannotApproveFromNonZero();
    approve(spender, value);
  }

}


// File contracts/security-token/TransferRules.sol


contract TransferRules is ITransferRules {
    // ---------------------------------------------------------------
    //  Custom Errors (gas optimization: ~200 gas cheaper per revert)
    // ---------------------------------------------------------------
    error BadRestrictionCode();

    mapping(uint8 => string) internal errorMessage;

    // Gas optimization: constants are inlined at compile time (no SLOAD)
    uint8 public constant SUCCESS = 0;
    uint8 public constant GREATER_THAN_RECIPIENT_MAX_BALANCE = 1;
    uint8 public constant SENDER_TOKENS_TIME_LOCKED = 2;
    uint8 public constant DO_NOT_SEND_TO_TOKEN_CONTRACT = 3;
    uint8 public constant DO_NOT_SEND_TO_EMPTY_ADDRESS = 4;
    uint8 public constant SENDER_ADDRESS_FROZEN = 5;
    uint8 public constant ALL_TRANSFERS_PAUSED = 6;
    uint8 public constant TRANSFER_GROUP_NOT_APPROVED = 7;
    uint8 public constant TRANSFER_GROUP_NOT_ALLOWED_UNTIL_LATER = 8;
    uint8 public constant RECIPIENT_ADDRESS_FROZEN = 9;

  constructor() {
    errorMessage[SUCCESS] = "SUCCESS";
    errorMessage[GREATER_THAN_RECIPIENT_MAX_BALANCE] = "GREATER THAN RECIPIENT MAX BALANCE";
    errorMessage[SENDER_TOKENS_TIME_LOCKED] = "SENDER TOKENS LOCKED";
    errorMessage[DO_NOT_SEND_TO_TOKEN_CONTRACT] = "DO NOT SEND TO TOKEN CONTRACT";
    errorMessage[DO_NOT_SEND_TO_EMPTY_ADDRESS] = "DO NOT SEND TO EMPTY ADDRESS";
    errorMessage[SENDER_ADDRESS_FROZEN] = "SENDER ADDRESS IS FROZEN";
    errorMessage[ALL_TRANSFERS_PAUSED] = "ALL TRANSFERS PAUSED";
    errorMessage[TRANSFER_GROUP_NOT_APPROVED] = "TRANSFER GROUP NOT APPROVED";
    errorMessage[TRANSFER_GROUP_NOT_ALLOWED_UNTIL_LATER] = "TRANSFER GROUP NOT ALLOWED UNTIL LATER";
    errorMessage[RECIPIENT_ADDRESS_FROZEN] = "RECIPIENT ADDRESS IS FROZEN";
  }

  /// @notice Detects if a transfer will be reverted and if so returns an appropriate reference code
  /// @param from Sending address
  /// @param to Receiving address
  /// @param value Amount of tokens being transferred
  /// @return Code by which to reference message for rejection reason
  /// Gas optimization: short-circuit evaluation ordered by cheapest checks first
  function detectTransferRestriction(
    address _token,
    address from,
    address to,
    uint256 value
  )
    external
    override
    view
    returns(uint8)
  {
    RestrictedLockupToken token = RestrictedLockupToken(_token);

    // Gas optimization: cheapest checks first (storage reads vs. external calls)
    // isPaused is a single SLOAD
    if (token.isPaused()) return ALL_TRANSFERS_PAUSED;

    // Zero-address check is nearly free (no storage)
    if (to == address(0)) return DO_NOT_SEND_TO_EMPTY_ADDRESS;
    if (to == address(token)) return DO_NOT_SEND_TO_TOKEN_CONTRACT;

    // Frozen checks are single SLOAD each
    if (token.getFrozenStatus(from)) return SENDER_ADDRESS_FROZEN;
    if (token.getFrozenStatus(to)) return RECIPIENT_ADDRESS_FROZEN;

    // Gas optimization: cache getMaxBalance to avoid potential double external call
    uint256 maxBal = token.getMaxBalance(to);
    if ((maxBal > 0) &&
        (token.balanceOf(to) + value > maxBal)
       ) return GREATER_THAN_RECIPIENT_MAX_BALANCE;

    // @dev Remove it Change it on data on TokenLockup settings
    uint256 lockedUntil = token.getAllowTransferTime(from, to);
    if (0 == lockedUntil) return TRANSFER_GROUP_NOT_APPROVED;
    if (block.timestamp < lockedUntil) return TRANSFER_GROUP_NOT_ALLOWED_UNTIL_LATER;

    if ( token.unlockedBalanceOf(from) < value
        && token.balanceOf(from) > value
    ) return SENDER_TOKENS_TIME_LOCKED;

    return SUCCESS;
  }

  /// @notice Returns a human-readable message for a given restriction code
  /// @param restrictionCode Identifier for looking up a message
  /// @return Text showing the restriction's reasoning
  function messageForTransferRestriction(uint8 restrictionCode)
    external
    override
    view
    returns(string memory)
  {
    if (restrictionCode > 9) revert BadRestrictionCode();
    return errorMessage[restrictionCode];
  }

  /// @notice a method for checking a response code to determine if a transfer was succesful.
  /// Defining this separately from the token contract allows it to be upgraded.
  /// For instance this method would need to be upgraded if the SUCCESS code was changed to 1
  /// as specified in ERC-1066 instead of 0 as specified in ERC-1404.
  /// @param restrictionCode The code to check.
  /// @return isSuccess A boolean indicating if the code is the SUCCESS code.
  function checkSuccess(uint8 restrictionCode)
    external
    override
    pure
    returns(bool isSuccess)
  {
    return restrictionCode == SUCCESS;
  }
}
