
// The scrimmage's own setup fields, shown at the top of the console's setup
// page in place of the event and match pickers: the two teams, their rosters
// and the division (which decides whether gender lines apply). Styled as the
// setup page's other fields.

const FIELD_CLASS =
  "w-full rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30";
const LABEL_CLASS = "block space-y-1 text-sm font-semibold text-[#0f5132]";

export default function ScrimmageSetupFields({ form, onChange, rules, setRules }) {
  const set = (key) => (event) => onChange({ ...form, [key]: event.target.value });
  const division = (rules?.division || "mixed").toLowerCase();
  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-2">
        <label className={LABEL_CLASS}>
          <span>Team A</span>
          <input type="text" value={form.teamAName} onChange={set("teamAName")} className={FIELD_CLASS} />
        </label>
        <label className={LABEL_CLASS}>
          <span>Team B</span>
          <input type="text" value={form.teamBName} onChange={set("teamBName")} className={FIELD_CLASS} />
        </label>
        <label className={LABEL_CLASS}>
          <span>{form.teamAName || "Team A"} roster</span>
          <textarea
            rows={5}
            value={form.rosterA}
            onChange={set("rosterA")}
            placeholder={"One player per line, e.g.\nEmma Belcher #7"}
            className={FIELD_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          <span>{form.teamBName || "Team B"} roster</span>
          <textarea
            rows={5}
            value={form.rosterB}
            onChange={set("rosterB")}
            placeholder={"One player per line, e.g.\nEmma Belcher #7"}
            className={FIELD_CLASS}
          />
        </label>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f5132]">
        <span className="shrink-0">Division</span>
        <select
          value={division}
          onChange={(event) => setRules?.((prev) => ({ ...prev, division: event.target.value }))}
          className="flex-1 min-w-[110px] rounded-2xl border border-[#0f5132]/30 bg-[#ecfdf3] px-3 py-1.5 text-sm text-[#0f5132] focus:border-[#0f5132] focus:outline-none focus:ring-2 focus:ring-[#1c8f5a]/30"
        >
          <option value="mixed">Mixed</option>
          <option value="open">Open</option>
          <option value="women">Women</option>
        </select>
      </label>
    </div>
  );
}
