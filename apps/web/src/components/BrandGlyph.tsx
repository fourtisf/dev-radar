/**
 * The DevRadar eye mark, inline at nav/topbar size. Replaces the
 * prototype's placeholder .glyph circle with the chosen brand mark.
 */
export function BrandGlyph({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      <defs>
        <linearGradient id="brand-g" x1="0" y1="0" x2="0.78" y2="1">
          <stop offset="0" stopColor="#F4D789" />
          <stop offset="0.48" stopColor="#E2B65B" />
          <stop offset="1" stopColor="#B9893A" />
        </linearGradient>
      </defs>
      <path
        d="M5,32 Q32,8.5 59,32 Q32,55.5 5,32 Z"
        fill="none"
        stroke="url(#brand-g)"
        strokeWidth="4.2"
      />
      <circle cx="32" cy="32" r="11.5" fill="none" stroke="#E2B65B" strokeWidth="1.8" opacity="0.55" />
      <circle cx="32" cy="32" r="7.2" fill="url(#brand-g)" />
      <circle cx="34.6" cy="29.4" r="2.1" fill="#060607" opacity="0.85" />
    </svg>
  );
}
