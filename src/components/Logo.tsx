export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" width={size} height={size} alt="" />
      <span style={{ fontSize: size * 0.7 }}>Replyr</span>
    </span>
  );
}
