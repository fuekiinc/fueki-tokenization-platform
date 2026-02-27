/**
 * FieldRenderers -- input components for each Solidity constructor parameter type.
 *
 * Each renderer follows the platform's dark glassmorphism design system
 * (bg-[#0D0F14], border-white/[0.06], indigo focus ring) and exposes a
 * consistent API so that `renderField` can dispatch to the right component
 * based on a `ConstructorParam.type` value.
 */

import { useCallback, useId, useMemo } from 'react';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Hash, List } from 'lucide-react';

import type { ConstructorParam } from '../../types/contractDeployer';
import { INPUT_CLASSES } from '../../lib/designTokens';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface FieldProps {
  name: string;
  label: string;
  description: string;
  placeholder: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function FieldLabel({
  htmlFor,
  children,
  description,
}: {
  htmlFor: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-2">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-300"
      >
        {children}
      </label>
      {description && (
        <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/** Returns true when `v` looks like a valid EIP-55 / lowercase Ethereum address. */
function isLikelyAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

/** Strip surrounding whitespace on paste for address/hex fields. */
function pasteClean(
  onChange: (v: string) => void,
): React.ClipboardEventHandler<HTMLInputElement | HTMLTextAreaElement> {
  return (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text/plain').trim();
    onChange(pasted);
  };
}

// ---------------------------------------------------------------------------
// 1. AddressField
// ---------------------------------------------------------------------------

export function AddressField({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
}: FieldProps) {
  const id = useId();
  const valid = value.length > 0 && isLikelyAddress(value);
  const invalid = value.length > 0 && !isLikelyAddress(value);

  return (
    <div>
      <FieldLabel htmlFor={id} description={description}>
        {label}
      </FieldLabel>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          spellCheck={false}
          autoComplete="off"
          className={clsx(
            INPUT_CLASSES.base,
            'font-mono text-[13px] pr-10',
            invalid && 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20',
            valid && 'border-emerald-500/30',
          )}
          placeholder={placeholder || '0x...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={pasteClean(onChange)}
          disabled={disabled}
        />
        {valid && (
          <CheckCircle2
            className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400"
            aria-label="Valid address"
          />
        )}
        {invalid && (
          <AlertCircle
            className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400"
            aria-label="Invalid address"
          />
        )}
      </div>
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Uint256Field
// ---------------------------------------------------------------------------

interface Uint256FieldProps extends FieldProps {
  decimals?: number;
}

export function Uint256Field({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
  decimals,
}: Uint256FieldProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Allow digits, a single decimal point, and empty string
      const raw = e.target.value;
      if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
        onChange(raw);
      }
    },
    [onChange],
  );

  return (
    <div>
      <FieldLabel htmlFor={id} description={description}>
        {label}
      </FieldLabel>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={clsx(
          INPUT_CLASSES.base,
          'tabular-nums',
          error && 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20',
        )}
        placeholder={placeholder || '0'}
        value={value}
        onChange={handleChange}
        disabled={disabled}
      />
      {typeof decimals === 'number' && decimals > 0 && value && (
        <p className="mt-1 text-xs text-gray-600 tabular-nums">
          Raw value: {value} (with {decimals} decimals applied on-chain)
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. StringField
// ---------------------------------------------------------------------------

export function StringField({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
}: FieldProps) {
  const id = useId();

  return (
    <div>
      <FieldLabel htmlFor={id} description={description}>
        {label}
      </FieldLabel>
      <input
        id={id}
        name={name}
        type="text"
        autoComplete="off"
        className={clsx(
          INPUT_CLASSES.base,
          error && 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20',
        )}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. BoolField
// ---------------------------------------------------------------------------

export function BoolField({
  label,
  description,
  value,
  error,
  onChange,
  disabled,
}: Omit<FieldProps, 'placeholder'>) {
  const id = useId();
  const isTrue = value === 'true';

  return (
    <div>
      <div className="mb-2">
        <span className="block text-sm font-medium text-gray-300">{label}</span>
        {description && (
          <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={isTrue}
        aria-label={`${label}: ${isTrue ? 'true' : 'false'}`}
        disabled={disabled}
        onClick={() => onChange(isTrue ? 'false' : 'true')}
        className={clsx(
          'relative inline-flex h-7 w-[52px] items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:ring-offset-2 focus:ring-offset-[#0D0F14]',
          isTrue
            ? 'bg-indigo-600'
            : 'bg-white/[0.08] border border-white/[0.06]',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span
          className={clsx(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200',
            isTrue ? 'translate-x-[26px]' : 'translate-x-1',
          )}
        />
      </button>
      <span className="ml-3 text-sm text-gray-400 tabular-nums font-mono">
        {isTrue ? 'true' : 'false'}
      </span>
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. BytesField
// ---------------------------------------------------------------------------

export function BytesField({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
}: FieldProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value;
      // Auto-prefix 0x when user types hex characters without it
      if (raw.length > 0 && !raw.startsWith('0x') && !raw.startsWith('0X')) {
        if (/^[0-9a-fA-F]+$/.test(raw)) {
          raw = '0x' + raw;
        }
      }
      onChange(raw);
    },
    [onChange],
  );

  return (
    <div>
      <FieldLabel htmlFor={id} description={description}>
        {label}
      </FieldLabel>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          spellCheck={false}
          autoComplete="off"
          className={clsx(
            INPUT_CLASSES.base,
            'font-mono text-[13px] pl-11',
            error && 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20',
          )}
          placeholder={placeholder || '0x0000...'}
          value={value}
          onChange={handleChange}
          onPaste={pasteClean(onChange)}
          disabled={disabled}
        />
        <Hash
          className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600"
          aria-hidden="true"
        />
      </div>
      {value && value.startsWith('0x') && (
        <p className="mt-1 text-xs text-gray-600 tabular-nums">
          {Math.max(0, (value.length - 2) / 2)} bytes
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. AddressArrayField
// ---------------------------------------------------------------------------

export function AddressArrayField({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
}: FieldProps) {
  const id = useId();

  const addresses = useMemo(() => {
    if (!value.trim()) return [];
    return value
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
  }, [value]);

  const validCount = addresses.filter(isLikelyAddress).length;

  return (
    <div>
      <FieldLabel htmlFor={id} description={description}>
        {label}
      </FieldLabel>
      <div className="relative">
        <textarea
          id={id}
          name={name}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          className={clsx(
            INPUT_CLASSES.base,
            'font-mono text-[13px] resize-y min-h-[100px]',
            error && 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20',
          )}
          placeholder={
            placeholder || '0x1234..., 0x5678...\nOne address per line or comma-separated'
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={pasteClean(onChange)}
          disabled={disabled}
        />
      </div>
      {addresses.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border',
              validCount === addresses.length
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            )}
          >
            <List className="h-3 w-3" aria-hidden="true" />
            {validCount}/{addresses.length} valid
          </span>
        </div>
      )}
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Uint256ArrayField
// ---------------------------------------------------------------------------

export function Uint256ArrayField({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
}: FieldProps) {
  const id = useId();

  const items = useMemo(() => {
    if (!value.trim()) return [];
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }, [value]);

  const validCount = items.filter((v) => /^\d+\.?\d*$/.test(v)).length;

  return (
    <div>
      <FieldLabel htmlFor={id} description={description}>
        {label}
      </FieldLabel>
      <div className="relative">
        <textarea
          id={id}
          name={name}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          className={clsx(
            INPUT_CLASSES.base,
            'tabular-nums resize-y min-h-[80px]',
            error && 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20',
          )}
          placeholder={placeholder || '100, 200, 300\nComma-separated numbers'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      {items.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border',
              validCount === items.length
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            )}
          >
            <List className="h-3 w-3" aria-hidden="true" />
            {validCount}/{items.length} valid
          </span>
        </div>
      )}
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Uint256FixedArrayField
// ---------------------------------------------------------------------------

interface Uint256FixedArrayFieldProps extends FieldProps {
  arraySize: number;
}

export function Uint256FixedArrayField({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
  arraySize,
}: Uint256FixedArrayFieldProps) {
  const id = useId();

  // Parse comma-separated value into individual items, padding to arraySize
  const items = useMemo(() => {
    const parts = value ? value.split(',').map((v) => v.trim()) : [];
    return Array.from({ length: arraySize }, (_, i) => parts[i] ?? '');
  }, [value, arraySize]);

  const handleItemChange = useCallback(
    (index: number, newVal: string) => {
      // Only allow digits and a single decimal point
      if (newVal !== '' && !/^\d*\.?\d*$/.test(newVal)) return;
      const updated = [...items];
      updated[index] = newVal;
      onChange(updated.join(','));
    },
    [items, onChange],
  );

  return (
    <div>
      <FieldLabel htmlFor={`${id}-0`} description={description}>
        {label}
        <span className="ml-1.5 text-xs text-gray-600">
          [{arraySize} values]
        </span>
      </FieldLabel>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: arraySize }, (_, i) => (
          <div key={i} className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              [{i}]
            </span>
            <input
              id={`${id}-${i}`}
              name={`${name}[${i}]`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={clsx(
                INPUT_CLASSES.base,
                'pl-10 tabular-nums',
                error && 'border-red-500/40',
              )}
              placeholder={placeholder || '0'}
              value={items[i]}
              onChange={(e) => handleItemChange(i, e.target.value)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Uint64Field
// ---------------------------------------------------------------------------

export function Uint64Field({
  name,
  label,
  description,
  placeholder,
  value,
  error,
  onChange,
  disabled,
}: FieldProps) {
  const id = useId();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === '' || /^\d+$/.test(raw)) {
        onChange(raw);
      }
    },
    [onChange],
  );

  return (
    <div>
      <FieldLabel htmlFor={id} description={description}>
        {label}
      </FieldLabel>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={clsx(
          INPUT_CLASSES.base,
          'tabular-nums',
          error && 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20',
        )}
        placeholder={placeholder || '0'}
        value={value}
        onChange={handleChange}
        disabled={disabled}
      />
      <FieldError message={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderField dispatcher
// ---------------------------------------------------------------------------

/**
 * Renders the appropriate input component for a given constructor parameter.
 *
 * @param param  - The constructor parameter definition from the template.
 * @param value  - Current string value for this parameter.
 * @param error  - Validation error message, if any.
 * @param onChange - Callback invoked when the user changes the value.
 * @param disabled - Whether the field is disabled (e.g. during deployment).
 */
export function renderField(
  param: ConstructorParam,
  value: string,
  error: string | undefined,
  onChange: (value: string) => void,
  disabled?: boolean,
): React.ReactNode {
  const baseProps: FieldProps = {
    name: param.name,
    label: param.label,
    description: param.description,
    placeholder: param.placeholder,
    value,
    error,
    onChange,
    disabled,
  };

  switch (param.type) {
    case 'address':
      return <AddressField key={param.name} {...baseProps} />;

    case 'uint256':
      return (
        <Uint256Field
          key={param.name}
          {...baseProps}
          decimals={param.decimals}
        />
      );

    case 'uint64':
      return <Uint64Field key={param.name} {...baseProps} />;

    case 'string':
      return <StringField key={param.name} {...baseProps} />;

    case 'bool':
      return <BoolField key={param.name} {...baseProps} />;

    case 'bytes32':
      return <BytesField key={param.name} {...baseProps} />;

    case 'address[]':
      return <AddressArrayField key={param.name} {...baseProps} />;

    case 'uint256[]':
      return <Uint256ArrayField key={param.name} {...baseProps} />;

    case 'uint256[5]':
      return (
        <Uint256FixedArrayField
          key={param.name}
          {...baseProps}
          arraySize={5}
        />
      );

    default: {
      // Fallback: render as a string field for any unrecognised Solidity type.
      // This keeps the form usable even if a new type is added to the template
      // registry before a dedicated renderer is created.
      return <StringField key={param.name} {...baseProps} />;
    }
  }
}
