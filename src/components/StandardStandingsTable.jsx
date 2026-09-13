import { Link } from "react-router-dom";
import {
  FORM_DOT_COLORS,
  FORM_LEGEND_ITEMS,
  FORM_OUTCOME_LABELS,
  formatScoreDiff,
} from "../utils/standings";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Form dot size + gap in the standalone form column, kept in sync with the
// h-[7px]/w-[7px] dots below. Used to size the column so every dot fits on one
// line rather than guessing a width and letting them wrap.
const FORM_DOT_SIZE_PX = 7;
const FORM_DOT_GAP_PX = 2;
// Horizontal padding on the form <th>/<td> (px-1 = 0.25rem each side).
const FORM_COL_PADDING_PX = 8;

const getFormRowWidthPx = (dotCount) =>
  dotCount <= 0 ? 0 : dotCount * FORM_DOT_SIZE_PX + (dotCount - 1) * FORM_DOT_GAP_PX;

export function FormDots({ form, className = "", dotClassName = "h-1.5 w-1.5" }) {
  if (!form?.length) return null;
  return (
    <div className={cx("flex flex-nowrap gap-0.5", className)} aria-hidden="true">
      {form.map((entry, index) => (
        <span
          key={index}
          title={entry.title}
          className={cx("inline-block rounded-full", dotClassName)}
          style={{
            backgroundColor: FORM_DOT_COLORS[entry.outcome] || FORM_DOT_COLORS.scheduled,
          }}
        />
      ))}
    </div>
  );
}

export function StandardStandingsLegend({ className = "" }) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wide text-ink-muted",
        className,
      )}
    >
      {FORM_LEGEND_ITEMS.map((outcome) => (
        <span key={outcome} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: FORM_DOT_COLORS[outcome] }}
          />
          {FORM_OUTCOME_LABELS[outcome]}
        </span>
      ))}
    </div>
  );
}

/**
 * Standardised team-standings table for event workspaces.
 *
 * Rows come from `buildPoolGroupStandings` in utils/standings. Column set is
 * driven by props so a plain pool table and a full league table share one
 * implementation:
 *  - `showRank`   adds the leading "#" position column.
 *  - `showPoints` adds the "Pts" column (league-points events only).
 *  - `showForm`   renders the form-guide dots (off for events that don't use them).
 *
 * The form column is sized to fit the longest form line on a single row, and
 * `sc-standings-form-col` / `sc-standings-form-inline` (theme.css) move the
 * dots underneath the team name when the card is too narrow for a column.
 */
export function StandardStandingsTable({
  rows,
  showRank = false,
  showPoints = false,
  showForm = true,
  emptyLabel = "No standings available yet.",
  className = "",
}) {
  if (!rows?.length) {
    return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  }

  const maxFormLength = rows.reduce((max, row) => Math.max(max, row.form?.length || 0), 0);
  const formColWidthPx = getFormRowWidthPx(maxFormLength) + FORM_COL_PADDING_PX;

  return (
    <div
      className={cx(
        "sc-standings-table-wrap min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded border border-border bg-surface",
        className,
      )}
    >
      <table className="w-full table-fixed whitespace-nowrap text-xs">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            {showRank ? (
              <th className="w-8 px-0.5 py-1 text-center font-semibold">#</th>
            ) : null}
            <th className="w-full px-1 py-1 text-left font-semibold">Team</th>
            {showForm ? (
              <th
                className="sc-standings-form-col px-1 py-1 text-center font-semibold"
                style={{ width: `${formColWidthPx}px` }}
              >
                Form
              </th>
            ) : null}
            {showPoints ? (
              <th className="w-10 px-0.5 py-1 text-center font-semibold">Pts</th>
            ) : null}
            <th className="w-10 px-0.5 py-1 text-center font-semibold">W-L</th>
            <th className="w-9 px-0.5 py-1 text-center font-semibold">+/-</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              style={{
                background:
                  index % 2 === 0 ? "var(--sc-surface)" : "var(--sc-surface-muted)",
              }}
            >
              {showRank ? (
                <td className="px-0.5 py-1 text-center align-top tabular-nums text-ink-muted">
                  {index + 1}
                </td>
              ) : null}
              <td className="min-w-0 px-1 py-1 align-top" title={row.name}>
                {row.id ? (
                  <Link
                    to={`/teams/${row.id}`}
                    className="block truncate text-inherit! hover:underline"
                  >
                    {row.name}
                  </Link>
                ) : (
                  <span className="block truncate">{row.name}</span>
                )}
                {showForm ? (
                  <div className="sc-standings-form-inline">
                    <FormDots form={row.form} className="mt-0.5" />
                  </div>
                ) : null}
              </td>
              {showForm ? (
                <td className="sc-standings-form-col px-1 py-1 align-top">
                  <FormDots
                    form={row.form}
                    className="justify-center"
                    dotClassName="h-[7px] w-[7px]"
                  />
                </td>
              ) : null}
              {showPoints ? (
                <td className="px-0.5 py-1 text-center align-top tabular-nums">
                  {row.points}
                </td>
              ) : null}
              <td className="px-0.5 py-1 text-center align-top tabular-nums">
                {`${row.wins}-${row.losses}`}
              </td>
              <td className="px-0.5 py-1 text-center align-top tabular-nums">
                {formatScoreDiff(row.scoreDiff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
