import clsx from 'clsx';

type FuekiBrandVariant = 'mark' | 'full';

interface FuekiBrandProps {
  variant?: FuekiBrandVariant;
  className?: string;
  imageClassName?: string;
  alt?: string;
}

export default function FuekiBrand({
  variant = 'full',
  className,
  imageClassName,
  alt,
}: FuekiBrandProps) {
  const src = '/fueki-logo.jpg';

  return (
    <span className={clsx('inline-flex items-center', className)}>
      <img
        src={src}
        alt={alt ?? 'Fueki logo'}
        className={clsx(
          variant === 'mark' ? 'h-12 w-12' : 'h-11 w-auto',
          imageClassName,
        )}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
