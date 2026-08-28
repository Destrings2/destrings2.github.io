interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function PlanIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 6h10M4 12h13M4 18h7" />
      <path d="M18 5.5l1.4 1.4L22 4.3" />
    </svg>
  );
}

export function HomeIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

export function RoomsIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M3 11h8V3M11 11v10M15 11h6" />
    </svg>
  );
}

export function TimeIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

export function SplitIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3v18" />
      <path d="M4 8.5h4.5M4 13h4.5" />
      <path d="M15.5 8.5H20M15.5 13H20" />
    </svg>
  );
}
