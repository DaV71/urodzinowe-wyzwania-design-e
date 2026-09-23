// Ikony inline SVG ze SPEC §8: viewBox 24×24, bez wypełnienia, obrys currentColor, zaokrąglone końce.
import type { ReactNode } from "react";

export type IconProps = {
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
};

function Svg({
  size = 24,
  strokeWidth = 2,
  color = "currentColor",
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconCheck({ strokeWidth = 3, ...props }: IconProps) {
  return (
    <Svg strokeWidth={strokeWidth} {...props}>
      <path d="M5 13l4 4L19 7" />
    </Svg>
  );
}

export function IconDumbbell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 5v14" />
      <path d="M18 5v14" />
      <path d="M3 8v8" />
      <path d="M21 8v8" />
      <path d="M6 12h12" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function IconGift(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12v9H4v-9" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />
    </Svg>
  );
}
