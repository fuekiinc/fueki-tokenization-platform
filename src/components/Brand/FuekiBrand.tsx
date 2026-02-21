import clsx from 'clsx';
import fuekiLogo from '../../assets/fueki-logo.jpg';

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
  const src = fuekiLogo;

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
