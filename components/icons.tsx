import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Reactor mark — stacked perspective rails. */
export function ReactorMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} {...props}>
      <path d="M5 8.5 12 6l7 2.5-7 2.5-7-2.5Z" {...base} />
      <path d="M6.5 12.5 12 14.5l5.5-2" {...base} />
      <path d="M7.5 16 12 17.6 16.5 16" {...base} />
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} {...props}>
      <path d="M5 12h13M13 6l6 6-6 6" {...base} />
    </svg>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="m6 9 6 6 6-6" {...base} />
    </svg>
  );
}

export function Plus(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} {...props}>
      <path d="M12 5v14M5 12h14" {...base} />
    </svg>
  );
}

export function Power(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M12 4v8" {...base} />
      <path d="M7.5 7a7 7 0 1 0 9 0" {...base} />
    </svg>
  );
}

export function Refresh(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M4 11a8 8 0 0 1 13.7-5.3L20 8" {...base} />
      <path d="M20 4v4h-4" {...base} />
      <path d="M20 13a8 8 0 0 1-13.7 5.3L4 16" {...base} />
      <path d="M4 20v-4h4" {...base} />
    </svg>
  );
}

export function Pause(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M9 5v14M15 5v14" {...base} />
    </svg>
  );
}

export function Play(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M7 5l12 7-12 7V5Z" {...base} fill="currentColor" />
    </svg>
  );
}

export function MuteToggle({ muted, ...props }: IconProps & { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" {...base} />
      {muted ? (
        <path d="m17 9 4 6M21 9l-4 6" {...base} />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7" {...base} />
      )}
    </svg>
  );
}

export function Layers(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <path d="M12 4 3 9l9 5 9-5-9-5Z" {...base} />
      <path d="m3 14 9 5 9-5" {...base} />
    </svg>
  );
}

export function Scissors(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} {...props}>
      <circle cx="6" cy="6" r="2.4" {...base} />
      <circle cx="6" cy="18" r="2.4" {...base} />
      <path d="M8 7.5 20 18M8 16.5 20 6" {...base} />
    </svg>
  );
}

export function Download(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} {...props}>
      <path d="M12 4v11M7 11l5 5 5-5" {...base} />
      <path d="M5 20h14" {...base} />
    </svg>
  );
}

export function Spinner(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} {...props}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={2.2} fill="none" opacity={0.25} />
      <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowKey({ dir, ...props }: IconProps & { dir: "up" | "down" | "left" | "right" }) {
  const d = {
    up: "M12 18V6M6 12l6-6 6 6",
    down: "M12 6v12M6 12l6 6 6-6",
    left: "M18 12H6M12 6l-6 6 6 6",
    right: "M6 12h12M12 6l6 6-6 6",
  }[dir];
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} {...props}>
      <path d={d} {...base} />
    </svg>
  );
}
