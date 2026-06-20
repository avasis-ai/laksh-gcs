"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import {
  EVENT_PRESETS,
  POV_PRESETS,
  TOD_PRESETS,
  WEATHER_PRESETS,
  type PromptPreset,
} from "@/lib/laksh/scene";
import { useStudio } from "./StudioProvider";
import { Plus, Spinner, Target } from "./icons";

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label-mono">{children}</span>
      {right}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-[18px] w-[32px] rounded-full transition-colors"
      style={{ background: checked ? "var(--accent)" : "var(--border-strong)" }}
    >
      <span
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[left] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ left: checked ? "16px" : "2px" }}
      />
    </button>
  );
}

function ChipRow({
  presets,
  active,
  onPick,
}: {
  presets: PromptPreset[];
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className="tac-chip"
          data-active={active === p.value}
          onClick={() => onPick(active === p.value ? "" : p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function Sidebar() {
  const {
    seeds,
    uploads,
    selected,
    selectSeed,
    selectUpload,
    addUpload,
    scene,
    setBaseSlot,
    setPovSlot,
    setTimeSlot,
    setWeatherSlot,
    enhance,
    setEnhance,
    worldLocked,
    setWorldLocked,
    generate,
    busy,
    busyLabel,
    state,
    injectEvent,
    injectCustomTarget,
    clearMarkers,
    markers,
  } = useStudio();

  const fileRef = useRef<HTMLInputElement>(null);
  const running = Boolean(state?.started);
  const activeSeed = seeds.find((s) => s.id === selected?.id);
  const [targetLabel, setTargetLabel] = useState("");
  const [targetText, setTargetText] = useState("");

  return (
    <aside className="flex h-full w-[var(--rail)] shrink-0 flex-col border-r border-border bg-surface">
      {/* Rail header — identity lives in the command bar; this names the rail. */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="label-mono">Mission Tasking</span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: running ? "var(--good)" : "var(--faint)" }}
        />
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        {/* Mission seed rail */}
        <div>
          <SectionLabel>Mission Seed</SectionLabel>
          <div className="mt-2.5 grid grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-[7px] border border-dashed border-border-strong text-faint transition-colors hover:border-muted hover:text-muted"
              aria-label="Upload seed image"
            >
              <Plus />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) addUpload(f);
                e.target.value = "";
              }}
            />
            {uploads.map((u) => {
              const active = selected?.id === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => selectUpload(u)}
                  title={u.label}
                  className="relative aspect-square overflow-hidden rounded-[7px] border transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ borderColor: active ? "var(--accent-active)" : "var(--border)", boxShadow: active ? "0 0 0 2px var(--accent-soft)" : "none" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.src} alt={u.label} className="h-full w-full object-cover" />
                </button>
              );
            })}
            {seeds.map((s) => {
              const active = selected?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectSeed(s)}
                  title={s.label}
                  className="relative aspect-square overflow-hidden rounded-[7px] border transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ borderColor: active ? "var(--accent-active)" : "var(--border)", boxShadow: active ? "0 0 0 2px var(--accent-soft)" : "none" }}
                >
                  <Image src={s.src} alt={s.label} fill sizes="56px" className="object-cover" />
                </button>
              );
            })}
          </div>
          {selected && (
            <div className="mt-2">
              <p className="text-[11px] text-muted">
                <span className="label-mono">AO</span>{" "}
                <span className="text-foreground">{selected.label}</span>
              </p>
              {activeSeed?.brief && (
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  <span className="label-mono">Brief</span>{" "}
                  <span className="text-foreground/80">{activeSeed.brief}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Scene-graph */}
        <div className="mt-6">
          <SectionLabel right={
            <div className="flex items-center gap-1.5">
              <span className="label-mono">Enhance</span>
              <Toggle checked={enhance} onChange={setEnhance} />
            </div>
          }>
            Scene-Graph
          </SectionLabel>

          <textarea
            value={scene.base}
            onChange={(e) => setBaseSlot(e.target.value)}
            placeholder="Base theatre description…"
            rows={3}
            className="mt-2.5 w-full resize-none rounded-[8px] border border-border bg-surface-muted px-3 py-2.5 text-[12px] leading-relaxed text-foreground placeholder:text-faint focus:border-accent-active focus:bg-surface focus:outline-none"
          />

          <div className="mt-3">
            <span className="label-mono text-[8px]">POV · Altitude</span>
            <ChipRow presets={POV_PRESETS} active={scene.pov} onPick={setPovSlot} />
          </div>
          <div className="mt-3">
            <span className="label-mono text-[8px]">Time of Day</span>
            <ChipRow presets={TOD_PRESETS} active={scene.timeOfDay} onPick={setTimeSlot} />
          </div>
          <div className="mt-3">
            <span className="label-mono text-[8px]">Weather</span>
            <ChipRow presets={WEATHER_PRESETS} active={scene.weather} onPick={setWeatherSlot} />
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-[7px] text-[13px] font-semibold tracking-wide transition-colors disabled:cursor-not-allowed"
            style={{
              background: busy ? "var(--accent-soft)" : "var(--accent)",
              color: busy ? "var(--muted)" : "var(--accent-foreground)",
            }}
          >
            {busy ? (
              <>
                <Spinner className="spin" />
                {busyLabel || "Working…"}
              </>
            ) : running ? (
              "RE-TASK THEATRE"
            ) : (
              "ARM FEED ▸"
            )}
          </button>
          {!running && (
            <p className="mt-1.5 text-center text-[10px] text-faint">
              Connects GPU on demand · billing starts when armed
            </p>
          )}
          {running && (
            <div className="mt-3 flex items-center justify-between rounded-[7px] border border-border bg-surface-muted px-2.5 py-2">
              <div className="flex flex-col">
                <span className="label-mono">Lock World</span>
                <span className="text-[10px] text-faint">Freeze prompt during free-flight</span>
              </div>
              <Toggle checked={worldLocked} onChange={setWorldLocked} />
            </div>
          )}
        </div>

        {/* Target injection */}
        <div className="mt-6">
          <SectionLabel right={
            markers.length > 0 ? (
              <button type="button" onClick={clearMarkers} className="label-mono hover:text-foreground">
                Clear ({markers.length})
              </button>
            ) : undefined
          }>
            Target Injection
          </SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EVENT_PRESETS.map((ev) => (
              <button key={ev.id} type="button" className="tac-chip" onClick={() => injectEvent(ev)}>
                <Target width={11} height={11} />
                {ev.label}
              </button>
            ))}
          </div>
          <div className="mt-2.5 space-y-1.5">
            <input
              value={targetLabel}
              onChange={(e) => setTargetLabel(e.target.value)}
              placeholder="Designation (e.g. TGT-1)"
              className="w-full rounded-[7px] border border-border bg-surface-muted px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-faint focus:border-accent-active focus:bg-surface focus:outline-none"
            />
            <textarea
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder="Describe the entity to inject into the world…"
              rows={2}
              className="w-full resize-none rounded-[7px] border border-border bg-surface-muted px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-faint focus:border-accent-active focus:bg-surface focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                injectCustomTarget(targetLabel.trim(), targetText.trim());
                setTargetLabel("");
                setTargetText("");
              }}
              disabled={!targetText.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-[7px] border border-border bg-surface-muted py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Target width={13} height={13} />
              Inject Target
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
