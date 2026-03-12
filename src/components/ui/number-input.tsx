import { useState, useCallback } from 'react';
import { Input } from './input';
import { cn } from './utils';

interface NumberInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
  decimals?: number;
}

/**
 * Number input that uses string state internally to allow natural typing
 * of decimals (e.g. "0." → "0.1") and avoids the leading-zero bug.
 *
 * - Shows placeholder when value is 0/undefined/null (no "0" in the field)
 * - Converts to number only on blur, letting intermediate states like "3." exist
 * - Prevents scroll-to-change
 */
function NumberInput({
  value,
  onChange,
  placeholder = '0',
  decimals,
  className,
  onBlur,
  ...props
}: NumberInputProps) {
  // `raw` holds the string while focused; null means "not focused, use external value"
  const [raw, setRaw] = useState<string | null>(null);

  const displayValue =
    raw !== null
      ? raw
      : value === undefined || value === null || value === 0
        ? ''
        : String(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;

      if (text === '') {
        setRaw('');
        onChange(undefined);
        return;
      }

      // Allow valid intermediate states: digits, one decimal point, leading minus
      if (!/^-?\d*\.?\d*$/.test(text)) return;

      // Enforce max decimals if specified
      if (decimals !== undefined) {
        const dotIdx = text.indexOf('.');
        if (dotIdx !== -1 && text.length - dotIdx - 1 > decimals) return;
      }

      setRaw(text);

      // Only emit a number if the string is complete (not ending in "." or "-")
      if (!text.endsWith('.') && text !== '-') {
        const num = parseFloat(text);
        if (!isNaN(num)) onChange(num);
      }
    },
    [onChange, decimals],
  );

  const handleFocus = useCallback(() => {
    // Take over with string state
    if (value === undefined || value === null || value === 0) {
      setRaw('');
    } else {
      setRaw(String(value));
    }
  }, [value]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Normalize and release string state
      if (raw === '' || raw === '-' || raw === '.') {
        onChange(undefined);
      } else if (raw !== null) {
        const num = parseFloat(raw);
        if (!isNaN(num)) onChange(num);
      }
      setRaw(null);
      onBlur?.(e);
    },
    [raw, onChange, onBlur],
  );

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={cn('tabular-nums', className)}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onWheel={(e) => e.currentTarget.blur()}
      placeholder={placeholder}
      {...props}
    />
  );
}

export { NumberInput };
