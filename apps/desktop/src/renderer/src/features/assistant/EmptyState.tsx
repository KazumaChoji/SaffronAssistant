import logoUrl from '../../assets/logo.jpg';

export function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center select-none">
      <img
        src={logoUrl}
        alt=""
        draggable={false}
        className="logo-watermark-img mb-5"
        style={{ width: 100, height: 100 }}
      />
      <p className="text-[11px] text-white/[0.15] font-light tracking-wider">
        Ask anything or describe a task
      </p>
    </div>
  );
}
