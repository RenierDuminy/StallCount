import { useState } from "react";
import ModularScoreKeeperView from "../scorekeeper/ModularScoreKeeperView";
import ScrimmageReport from "./ScrimmageReport";
import ScrimmageSetupFields from "./ScrimmageSetupFields";
import { parseRosterText, rosterToText } from "./scrimmageRoster";
import {
  SCRIMMAGE_BACKEND,
  SCRIMMAGE_TEAM_A_ID,
  SCRIMMAGE_TEAM_B_ID,
  getScrimmageSnapshot,
  isScrimmageFinished,
  saveScrimmageTeams,
  startNewScrimmage,
} from "./scrimmageBackend";

// The scrimmage console is the competitive scorekeeper console itself
// (ModularScoreKeeperView), running on a data source kept on this device
// (scrimmageBackend.js) instead of the database. This page adds only what a
// scrimmage needs on top: its teams and rosters on the setup page, and the
// match report.

function readTeamsForm() {
  const { match, players } = getScrimmageSnapshot();
  return {
    teamAName: match.team_a?.name || "Light",
    teamBName: match.team_b?.name || "Dark",
    rosterA: rosterToText(players[SCRIMMAGE_TEAM_A_ID]),
    rosterB: rosterToText(players[SCRIMMAGE_TEAM_B_ID]),
  };
}

export default function ScrimmageConsolePage() {
  // A scrimmage that has ended stays on this device (for its report) until
  // the next one starts, so a visit after it opens a new one.
  const [consoleKey, setConsoleKey] = useState(() => {
    if (isScrimmageFinished(getScrimmageSnapshot().match)) startNewScrimmage();
    return 0;
  });
  // "console", "report" (opened mid-scrimmage; the console stays mounted
  // underneath, so nothing restarts) or "ended" (the report after the end).
  const [view, setView] = useState("console");
  const [teamsForm, setTeamsForm] = useState(readTeamsForm);

  const scrimmage = {
    backend: SCRIMMAGE_BACKEND,
    exitPath: "/",
    beforeSetupSubmit: () =>
      saveScrimmageTeams({
        teamAName: teamsForm.teamAName,
        teamBName: teamsForm.teamBName,
        rosterA: parseRosterText(teamsForm.rosterA),
        rosterB: parseRosterText(teamsForm.rosterB),
      }),
    onOpenReport: () => setView("report"),
    afterMatchEnd: () => setView("ended"),
    renderSetupFields: ({ rules, setRules }) => (
      <ScrimmageSetupFields form={teamsForm} onChange={setTeamsForm} rules={rules} setRules={setRules} />
    ),
  };

  if (view === "ended") {
    return (
      <ScrimmageReport
        backLabel="New scrimmage"
        onBack={() => {
          startNewScrimmage();
          setTeamsForm(readTeamsForm());
          setConsoleKey((key) => key + 1);
          setView("console");
        }}
      />
    );
  }
  return (
    <>
      {view === "report" && <ScrimmageReport onBack={() => setView("console")} />}
      <div className={view === "report" ? "hidden" : undefined}>
        <ModularScoreKeeperView key={consoleKey} format="full" scrimmage={scrimmage} />
      </div>
    </>
  );
}
