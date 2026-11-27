import { SPIRIT_SCALE } from "../utils/spirit";

// `dark` sits on the app's dark panels (captain portal); `light` on the
// light surface the Spirit Scores page uses.
const TONES = {
  dark: {
    frame: "border-border",
    divider: "border-border",
    active: "bg-accent text-[var(--sc-button-ink)]",
    idle: "bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink",
  },
  light: {
    frame: "border-light-edge/25",
    divider: "border-light-edge/20",
    active: "bg-light-success text-white",
    idle: "bg-white text-[var(--sc-surface-light-ink)]/75 hover:bg-light-edge/5 hover:text-[var(--sc-surface-light-ink)]",
  },
};

/**
 * What each value means on the WFDF scoresheet ("0 Poor · 1 Not so good ...").
 * The blocks show only the number, so every form that uses them shows this.
 */
export function SpiritScaleLegend({ className = "" }) {
  return (
    <p className={`text-xs ${className}`}>
      {SPIRIT_SCALE.map(({ value, label }, index) => (
        <span key={value} className="whitespace-nowrap">
          {index ? " · " : ""}
          <span className="font-semibold tabular-nums">{value}</span> {label}
        </span>
      ))}
    </p>
  );
}

/**
 * 0–4 segmented control for one WFDF spirit category: a tap target per value,
 * which is easier on a phone at the side of a field than a slider, and cannot
 * be nudged by a scroll that starts on it.
 */
export default function SpiritScoreBlocks({ label, value, onChange, tone = "dark", disabled = false, className = "" }) {
  const styles = TONES[tone] ?? TONES.dark;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`grid grid-cols-5 overflow-hidden rounded-lg border ${styles.frame} ${className}`}
    >
      {SPIRIT_SCALE.map(({ value: optionValue, label: valueLabel }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${optionValue} – ${valueLabel}`}
            title={valueLabel}
            disabled={disabled}
            onClick={() => onChange(optionValue)}
            className={`h-11 border-l ${styles.divider} text-sm font-semibold tabular-nums transition first:border-l-0 disabled:cursor-not-allowed sm:h-9 ${
              active ? styles.active : styles.idle
            }`}
          >
            {optionValue}
          </button>
        );
      })}
    </div>
  );
}
