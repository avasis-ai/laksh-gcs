"use client";

import { useCallback, useRef, useState } from "react";

import { useStudio } from "./StudioProvider";

interface JoystickProps {
  label: string;
  hint: string;
  /** Emits normalised axes, x right(+), y up(+), each in [-1,1]. */
  onChange: (x: number, y: number) => void;
  disabled?: boolean;
}

function Joystick({ label, hint, onChange, disabled }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = rect.width / 2;
      let dx = (clientX - cx) / radius;
      let dy = (clientY - cy) / radius;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
      setKnob({ x: dx * (radius - 18), y: dy * (radius - 18) });
      onChange(dx, -dy); // invert Y so up = +1
    },
    [onChange],
  );

  const end = useCallback(() => {
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5 select-none">
      <div
        ref={baseRef}
        className="relative h-28 w-28 touch-none rounded-full border bg-black/40 backdrop-blur-sm"
        style={{
          borderColor: disabled ? "var(--border)" : "var(--border-strong)",
          opacity: disabled ? 0.4 : 1,
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          activeId.current = e.pointerId;
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activeId.current !== e.pointerId) return;
          update(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (activeId.current !== e.pointerId) return;
          end();
        }}
        onPointerCancel={end}
      >
        {/* crosshair guides */}
        <div className="absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-[color:var(--border)]" />
        <div className="absolute top-1/2 left-2 right-2 h-px -translate-y-1/2 bg-[color:var(--border)]" />
        {/* knob */}
        <div
          className="absolute left-1/2 top-1/2 h-9 w-9 rounded-full border"
          style={{
            borderColor: "var(--accent-active)",
            background: "var(--accent-soft)",
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
            boxShadow: "0 0 12px rgba(47,224,138,0.35)",
          }}
        />
      </div>
      <span className="label-mono text-[8px]">{label}</span>
      <span className="text-[9px] text-faint">{hint}</span>
    </div>
  );
}

/**
 * Dual virtual joysticks (thumb-friendly corners). One normalised intent bus —
 * these publish into the provider's intent bus alongside keyboard + gamepad
 * (playbook §4.2.7). Left = move (throttle/strafe), right = look (yaw/pitch).
 */
export function VirtualJoysticks() {
  const { setVirtualMove, setVirtualLook, state } = useStudio();
  const enabled = Boolean(state?.started);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-end justify-between px-6">
      <Joystick label="MOVE" hint="throttle · strafe" onChange={setVirtualMove} disabled={!enabled} />
      <Joystick label="LOOK" hint="yaw · pitch" onChange={setVirtualLook} disabled={!enabled} />
    </div>
  );
}
