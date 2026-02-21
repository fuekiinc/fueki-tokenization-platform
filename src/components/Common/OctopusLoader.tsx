import clsx from 'clsx';

type OctopusLoaderSize = 'sm' | 'md' | 'lg';

export interface OctopusLoaderProps {
  size?: OctopusLoaderSize;
  label?: string;
  className?: string;
}

const sizeMap: Record<OctopusLoaderSize, number> = {
  sm: 76,
  md: 112,
  lg: 156,
};

export default function OctopusLoader({
  size = 'md',
  label = 'Loading',
  className,
}: OctopusLoaderProps) {
  const px = sizeMap[size];

  return (
    <div
      role="status"
      aria-label={label}
      className={clsx('octopus-loader', className)}
      style={{ width: px, height: px }}
    >
      <svg
        viewBox="0 0 200 200"
        className="octopus-loader__svg"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="92" className="octopus-loader__ring" />
        <g className="octopus-loader__octopus">
          <path
            className="octopus-loader__head"
            d="M100 44c-24 0-44 20-44 44 0 12 5 22 13 30v12a8 8 0 0 0 8 8h46a8 8 0 0 0 8-8v-12c8-8 13-18 13-30 0-24-20-44-44-44Z"
          />
          <circle cx="84" cy="84" r="5.4" className="octopus-loader__eye" />
          <circle cx="116" cy="84" r="5.4" className="octopus-loader__eye" />
          <circle cx="84" cy="84" r="2.2" className="octopus-loader__pupil" />
          <circle cx="116" cy="84" r="2.2" className="octopus-loader__pupil" />
          <path
            className="octopus-loader__mouth"
            d="M91 102c2 4 6 6 9 6s7-2 9-6"
          />
          <path className="octopus-loader__tentacle octopus-loader__tentacle--1" d="M72 132c-10 10-11 24-4 35 7-6 11-14 10-24 4 5 9 8 16 9" />
          <path className="octopus-loader__tentacle octopus-loader__tentacle--2" d="M90 132c-8 12-7 26 2 36 6-7 9-15 8-24 3 3 7 5 12 6" />
          <path className="octopus-loader__tentacle octopus-loader__tentacle--3" d="M110 132c8 12 7 26-2 36-6-7-9-15-8-24-3 3-7 5-12 6" />
          <path className="octopus-loader__tentacle octopus-loader__tentacle--4" d="M128 132c10 10 11 24 4 35-7-6-11-14-10-24-4 5-9 8-16 9" />
        </g>

        <g className="octopus-loader__bubbles">
          <circle cx="56" cy="66" r="4" className="octopus-loader__bubble octopus-loader__bubble--1" />
          <circle cx="146" cy="56" r="3.2" className="octopus-loader__bubble octopus-loader__bubble--2" />
          <circle cx="150" cy="122" r="2.6" className="octopus-loader__bubble octopus-loader__bubble--3" />
          <circle cx="46" cy="118" r="2.8" className="octopus-loader__bubble octopus-loader__bubble--4" />
        </g>
      </svg>

      <span className="sr-only">{label}</span>
    </div>
  );
}
