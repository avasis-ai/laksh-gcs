"use client";

import Image from "next/image";
import { useRef } from "react";

import { useStudio } from "./StudioProvider";
import {
  ArrowRight,
  ChevronDown,
  Plus,
  ReactorMark,
  Spinner,
} from "./icons";

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
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all"
        style={{ left: checked ? "16px" : "2px" }}
      />
    </button>
  );
}

const BUILD_LINKS = [
  { label: "LingBot Docs", href: "https://docs.reactor.inc" },
  { label: "Clone Demo App", href: "https://github.com/reactor-team/js-sdk" },
  { label: "Get API Key", href: "https://reactor.inc/dashboard" },
];

export function Sidebar() {
  const {
    scenes,
    uploads,
    selected,
    selectScene,
    selectUpload,
    addUpload,
    prompt,
    setPrompt,
    enhance,
    setEnhance,
    generate,
    busy,
    busyLabel,
    state,
    history,
    rerun,
  } = useStudio();

  const fileRef = useRef<HTMLInputElement>(null);
  const running = Boolean(state?.started);

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-muted text-foreground">
          <ReactorMark />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight">LingBot</div>
          <div className="truncate text-[11px] leading-tight text-muted">
            Action Controlled World Generation
          </div>
        </div>
        <ChevronDown className="text-faint" />
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        {/* Start building */}
        <SectionLabel>Start Building</SectionLabel>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {BUILD_LINKS.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="pill">
              {l.label}
              <ArrowRight className="text-muted" />
            </a>
          ))}
        </div>

        {/* Reference */}
        <div className="mt-6">
          <SectionLabel>Reference</SectionLabel>
          <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 scroll-thin">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[7px] border border-dashed border-border-strong text-faint transition-colors hover:border-muted hover:text-muted"
              aria-label="Upload reference image"
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
                  className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[7px] border transition-all"
                  style={{ borderColor: active ? "var(--accent-active)" : "var(--border)", boxShadow: active ? "0 0 0 2px var(--accent-soft)" : "none" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.src} alt={u.label} className="h-full w-full object-cover" />
                </button>
              );
            })}
            {scenes.map((s) => {
              const active = selected?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectScene(s)}
                  title={s.label}
                  className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[7px] border transition-all"
                  style={{ borderColor: active ? "var(--accent-active)" : "var(--border)", boxShadow: active ? "0 0 0 2px var(--accent-soft)" : "none" }}
                >
                  <Image src={s.src} alt={s.label} fill sizes="52px" className="object-cover" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate */}
        <div className="mt-6">
          <SectionLabel right={
            <div className="flex items-center gap-1.5">
              <span className="label-mono">Enhance</span>
              <Toggle checked={enhance} onChange={setEnhance} />
            </div>
          }>
            Generate the Scene
          </SectionLabel>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scene you want to generate…"
            rows={5}
            className="mt-2.5 w-full resize-none rounded-[8px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-faint focus:border-accent-active focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="mt-2.5 flex h-9 w-full items-center justify-center gap-2 rounded-[7px] text-[13px] font-semibold transition-colors disabled:cursor-not-allowed"
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
              "Update Scene"
            ) : (
              "Generate"
            )}
          </button>
        </div>

        {/* History */}
        <div className="mt-6">
          <SectionLabel>History</SectionLabel>
          {history.length === 0 ? (
            <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
              Generated scenes will appear here.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-1.5">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => rerun(h)}
                    className="flex w-full items-center gap-2.5 rounded-[7px] border border-transparent px-1.5 py-1.5 text-left transition-colors hover:border-border hover:bg-surface-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={h.thumb}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-[5px] border border-border object-cover"
                    />
                    <span className="line-clamp-2 text-[11px] leading-snug text-muted">
                      {h.prompt}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
