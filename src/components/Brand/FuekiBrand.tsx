import clsx from 'clsx';

type FuekiBrandVariant = 'mark' | 'full';

interface FuekiBrandProps {
  variant?: FuekiBrandVariant;
  className?: string;
  imageClassName?: string;
  alt?: string;
  priority?: boolean;
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
  priority = false,
  tight = false,
}: FuekiBrandProps) {
  const src = '/fueki-logo-320.jpg';
  const shouldPrioritize = priority || variant === 'full';
  const responsiveSizes = variant === 'mark' ? '48px' : '(max-width: 768px) 96px, 140px';

  return (
    <span className={clsx('inline-flex items-center leading-none', className)}>
      <span className={clsx('inline-flex items-center', tight && 'overflow-hidden')}>
        <picture>
          <source
            type="image/avif"
            srcSet="/fueki-logo-160.avif 160w, /fueki-logo-320.avif 320w, /fueki-logo.avif 950w"
            sizes={responsiveSizes}
          />
          <img
            src={src}
            srcSet="/fueki-logo-160.jpg 160w, /fueki-logo-320.jpg 320w, /fueki-logo.jpg 950w"
            sizes={responsiveSizes}
            alt={alt ?? 'Fueki logo'}
            className={clsx(
              !imageClassName && (variant === 'mark' ? 'h-12 w-12' : 'h-11 w-auto'),
              tight && 'origin-center transform-gpu scale-[1.10]',
              imageClassName,
            )}
            width={320}
            height={315}
            loading={shouldPrioritize ? 'eager' : 'lazy'}
            fetchPriority={shouldPrioritize ? 'high' : 'auto'}
            decoding="async"
          />
        </picture>
      </span>
    </span>
  );
}
