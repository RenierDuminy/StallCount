import { useMemo, useState } from "react";
import { Field, Textarea } from "../../components/ui/primitives";
import SpiritScoreBlocks from "../../components/SpiritScoreBlocks";
import { SPIRIT_DIMENSIONS, SPIRIT_MAX_SCORE, SPIRIT_SCALE } from "../../utils/spirit";

// WFDF neutral default: 2 ("good") in every category.
const DEFAULT_CATEGORY_SCORE = 2;

function initialScores(existing) {
  const scores = {};
  SPIRIT_DIMENSIONS.forEach(({ key }) => {
    const value = Number(existing?.[key]);
    scores[key] = Number.isFinite(value)
      ? Math.min(SPIRIT_MAX_SCORE, Math.max(0, Math.round(value)))
      : DEFAULT_CATEGORY_SCORE;
  });
  scores.comments = typeof existing?.comments === "string" ? existing.comments : "";
  return scores;
}

/**
 * Inline WFDF spirit form for the score a captain gives their opponent.
 *
 * The 0–4 control is the shared SpiritScoreBlocks, also used by the Spirit
 * Scores page (in its light tone).
 */
export default function CaptainSpiritEditor({ opponentName, existing, saving, onSave, onCancel }) {
  const [scores, setScores] = useState(() => initialScores(existing));

  const total = useMemo(
    () => SPIRIT_DIMENSIONS.reduce((sum, { key }) => sum + (scores[key] || 0), 0),
    [scores],
  );

  const setCategory = (key, value) => setScores((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(scores);
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            {existing ? "Edit spirit score" : "Spirit score"}
          </p>
          <p className="text-sm font-semibold text-ink">{opponentName || "Opponent"}</p>
        </div>
        <p className="text-right">
          <span className="text-2xl font-semibold tabular-nums text-ink">{total}</span>
        </p>
      </div>

      <div className="border-y border-border">
        <div className="hidden grid-cols-[1fr_20rem] items-center gap-3 border-b border-border py-1.5 sm:grid">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Category</span>
          <span className="grid grid-cols-5 text-center text-[10px] uppercase tracking-wide text-ink-muted">
            {SPIRIT_SCALE.map(({ value, label }) => (
              <span key={value}>{label}</span>
            ))}
          </span>
        </div>

        <div className="divide-y divide-border">
          {SPIRIT_DIMENSIONS.map(({ key, label }) => (
            <div key={key} className="grid items-center gap-2 py-2.5 sm:grid-cols-[1fr_20rem] sm:gap-3">
              <span className="text-sm text-ink">{label}</span>
              <SpiritScoreBlocks
                label={label}
                value={scores[key]}
                onChange={(value) => setCategory(key, value)}
              />
            </div>
          ))}
        </div>
      </div>

      <Field label="Comments (optional)" htmlFor="captain-spirit-comments">
        <Textarea
          id="captain-spirit-comments"
          rows={2}
          placeholder="Anything the tournament director should know"
          value={scores.comments}
          onChange={(event) => setScores((prev) => ({ ...prev, comments: event.target.value }))}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="sc-button is-ghost text-xs">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="sc-button text-xs disabled:cursor-not-allowed">
          {saving ? "Saving..." : existing ? "Save changes" : "Submit spirit score"}
        </button>
      </div>
    </form>
  );
}
