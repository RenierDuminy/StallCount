import { useCallback, useEffect, useMemo, useState } from "react";
import { getEventsList } from "../../services/leagueService";
import { getMatchesByEvent } from "../../services/matchService";
import { getMatchLogs, MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

const DEFAULT_EVENT_NAME = "Casual (TESTING)";
const DEFAULT_MATCH_ID = "03e24043-6581-4301-8ac0-e7d227565d9d";

function normaliseTeamKey(teamId, match) {
  if (!teamId || !match) return null;
  if (teamId === match.team_a?.id) return "A";
  if (teamId === match.team_b?.id) return "B";
  return null;
}

function mapEventCodeToType(code, teamKey) {
  switch (code) {
    case MATCH_LOG_EVENT_CODES.SCORE:
      return teamKey === "B" ? "score-B" : "score-A";
    case MATCH_LOG_EVENT_CODES.MATCH_START:
      return "match-start";
    case MATCH_LOG_EVENT_CODES.MATCH_END:
      return "match-end";
    case MATCH_LOG_EVENT_CODES.TURNOVER:
      return teamKey === "B" ? "turnover-B" : "turnover-A";
    case MATCH_LOG_EVENT_CODES.TIMEOUT_START:
    case MATCH_LOG_EVENT_CODES.TIMEOUT_END:
      return teamKey === "B" ? "timeout-B" : "timeout-A";
    case MATCH_LOG_EVENT_CODES.HALFTIME_START:
    case MATCH_LOG_EVENT_CODES.HALFTIME_END:
      return "halftime";
    case MATCH_LOG_EVENT_CODES.STOPPAGE_START:
    case MATCH_LOG_EVENT_CODES.STOPPAGE_END:
      return "stoppage";
    default:
      return "event";
  }
}

export function useScoreKeeperDataV2() {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadEvents = async () => {
      setEventsLoading(true);
      try {
        const data = await getEventsList();
        if (cancelled) return;
        setEvents(data);
        setEventsError(null);
        if (data?.length) {
          const preferred = data.find((event) => event.name === DEFAULT_EVENT_NAME);
          const nextEventId = preferred?.id || data[0].id;
          setSelectedEventId((prev) => prev || nextEventId);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load events";
        setEventsError(message);
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    };
    void loadEvents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    const loadMatches = async () => {
      setMatchesLoading(true);
      try {
        const data = await getMatchesByEvent(selectedEventId, 50, { includeFinished: true });
        if (cancelled) return;
        setMatches(data);
        setMatchesError(null);
        if (data?.length) {
          const hasSelected = selectedMatchId && data.some((match) => match.id === selectedMatchId);
          const hasDefault = data.some((match) => match.id === DEFAULT_MATCH_ID);
          const nextMatchId = hasSelected
            ? selectedMatchId
            : hasDefault
              ? DEFAULT_MATCH_ID
              : data[0].id;
          setSelectedMatchId(nextMatchId);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load matches";
        setMatchesError(message);
      } finally {
        if (!cancelled) setMatchesLoading(false);
      }
    };
    void loadMatches();
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedMatchId) return;
    let cancelled = false;
    const loadLogs = async () => {
      setLogsLoading(true);
      try {
        const data = await getMatchLogs(selectedMatchId);
        if (cancelled) return;
        setLogs(data);
        setLogsError(null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load match logs";
        setLogsError(message);
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    };
    void loadLogs();
    return () => {
      cancelled = true;
    };
  }, [selectedMatchId]);

  const mappedLogs = useMemo(() => {
    const match = matches.find((item) => item.id === selectedMatchId) || null;
    const teamAId = match?.team_a?.id ?? null;
    const teamBId = match?.team_b?.id ?? null;

    return (logs || []).map((log) => {
      const teamKey = normaliseTeamKey(log.team_id, match);
      const type = mapEventCodeToType(log.event?.code || "", teamKey);

      const descriptionParts = [];
      if (log.actor?.name) {
        descriptionParts.push(`Scorer: ${log.actor.name}`);
      }
      if (log.secondary_actor?.name) {
        descriptionParts.push(`Assist: ${log.secondary_actor.name}`);
      }
      const description =
        descriptionParts.length > 0
          ? descriptionParts.join(" -> ")
          : log.event?.description || "Match event";

      return {
        id: log.id,
        type,
        title: log.event?.description || "Match event",
        description,
        team: teamKey,
        scorer: log.actor?.name || null,
        assist: log.secondary_actor?.name || null,
        scoreLine:
          type === "score-A" || type === "score-B" || type === "match-end"
            ? {
                a: Number.isFinite(match?.score_a) ? match.score_a : 0,
                b: Number.isFinite(match?.score_b) ? match.score_b : 0,
              }
            : null,
      };
    });
  }, [logs, matches, selectedMatchId]);

  const activeMatch = useMemo(() => {
    return matches.find((m) => m.id === selectedMatchId) || matches[0] || null;
  }, [matches, selectedMatchId]);

  return {
    events,
    eventsLoading,
    eventsError,
    selectedEventId,
    setSelectedEventId,
    matches,
    matchesLoading,
    matchesError,
    selectedMatchId,
    setSelectedMatchId,
    logs,
    logsLoading,
    logsError,
    mappedLogs,
    activeMatch,
  };
}
