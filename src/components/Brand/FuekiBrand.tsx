import clsx from 'clsx';
import fuekiLogo from '../../assets/fueki-logo.jpg';

type FuekiBrandVariant = 'mark' | 'full';

interface FuekiBrandProps {
  variant?: FuekiBrandVariant;
  className?: string;
  imageClassName?: string;
  alt?: string;
  /**
   * Visually tightens the lockup by scaling the same source image slightly
   * inside an overflow-hidden wrapper (no asset modification).
   */
  tight?: boolean;
}

export default function FuekiBrand({
  variant = 'full',
  className,
  imageClassName,
  alt,
  tight = false,
}: FuekiBrandProps) {
  const src = fuekiLogo;

  return (
    <span className={clsx('inline-flex items-center leading-none', className)}>
      <span className={clsx('inline-flex items-center', tight && 'overflow-hidden')}>
        <img
          src={src}
          alt={alt ?? 'Fueki logo'}
          className={clsx(
            !imageClassName && (variant === 'mark' ? 'h-12 w-12' : 'h-11 w-auto'),
            tight && 'origin-center transform-gpu scale-[1.10]',
            imageClassName,
          )}
          loading="eager"
          decoding="async"
        />
      </span>
    </span>
  );
}
