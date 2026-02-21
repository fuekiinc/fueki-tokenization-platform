import clsx from 'clsx';

export default function AmbientBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div className="absolute -top-24 left-[8%] h-72 w-72 rounded-full bg-[#15b8bf]/18 blur-3xl animate-float" />
      <div className="absolute top-[20%] right-[6%] h-80 w-80 rounded-full bg-[#31a4dd]/16 blur-3xl animate-float" style={{ animationDelay: '600ms' }} />
      <div className="absolute -bottom-24 left-[30%] h-96 w-96 rounded-full bg-[#9be8ba]/12 blur-3xl animate-float" style={{ animationDelay: '1200ms' }} />

      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(191,225,241,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(191,225,241,0.18) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(circle at center, rgba(0,0,0,0.7), transparent 75%)',
        }}
      />
    </div>
  );
}
