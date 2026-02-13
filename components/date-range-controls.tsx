"use client";

const PRESETS = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "1y", label: "1Y", days: 365 }
] as const;

type PresetKey = (typeof PRESETS)[number]["key"] | "all";

export function DateRangeControls({
  from,
  to,
  compare,
  onSetRange,
  onSetPreset,
  onSetCompare,
  activePreset
}: {
  from: string;
  to: string;
  compare: boolean;
  onSetRange: (fromValue: string, toValue: string) => void;
  onSetPreset: (preset: PresetKey) => void;
  onSetCompare: (enabled: boolean) => void;
  activePreset: PresetKey | null;
}) {
  return (
    <section className="panel controls">
      <div className="preset-row">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            className={`button button-small ${activePreset === preset.key ? "button-active" : ""}`}
            onClick={() => onSetPreset(preset.key)}
          >
            {preset.label}
          </button>
        ))}
        <button
          className={`button button-small ${activePreset === "all" ? "button-active" : ""}`}
          onClick={() => onSetPreset("all")}
        >
          ALL
        </button>
      </div>

      <div className="range-row">
        <label>
          From
          <input type="date" value={from} onChange={(event) => onSetRange(event.target.value, to)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => onSetRange(from, event.target.value)} />
        </label>
        <label className="compare-toggle">
          <input type="checkbox" checked={compare} onChange={(event) => onSetCompare(event.target.checked)} />
          Compare with previous period
        </label>
      </div>
    </section>
  );
}
