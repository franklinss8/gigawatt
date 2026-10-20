export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" stroke="var(--volt)" strokeWidth="2" />
      <path d="M18 5 9 18h6l-1 9 9-13h-6l1-9z" fill="var(--volt)" />
    </svg>
  );
}
