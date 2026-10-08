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
    frame: "border-[#041311]/25",
    divider: "border-[#041311]/20",
    active: "bg-[#01611b] text-white",
    idle: "bg-white text-[var(--sc-surface-light-ink)]/75 hover:bg-[#041311]/5 hover:text-[var(--sc-surface-light-ink)]",
  },
};

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
