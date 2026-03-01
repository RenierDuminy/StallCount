import { MATCH_LOG_EVENT_CODES } from "../../services/matchLogService";

function formatMatchDate(timestamp) {
  if (!timestamp) return "TBD";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeLabel(timestamp, includeSeconds = false) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: false,
  });
}

function formatGap(diffMs) {
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "0:00";
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDurationLong(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "--";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(hours).padStart(1, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function mapToSortedList(map) {
  return Array.from(map.entries())
    .map(([player, count]) => ({ player, count }))
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player));
}

function mapToConnections(map) {
  return Array.from(map.entries())
    .map(([key, count]) => {
      const [assist, scorer] = key.split(":::");
      return { assist, scorer, count };
    })
    .sort((a, b) => b.count - a.count || a.assist.localeCompare(b.assist));
}

function buildPossessionMetrics({
  startTime,
  endTime,
  startingTeamKey,
  turnovers,
  scoringPoints,
}) {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return null;
  }

  const scoreFlipTurnovers = (scoringPoints || []).map((point) => ({
    time: point.time,
    team: point.team === "teamA" ? "teamB" : "teamA",
  }));

  const sortedEvents = [...(turnovers || []), ...scoreFlipTurnovers]
    .filter((event) => Number.isFinite(event.time))
    .sort((a, b) => a.time - b.time);

  const inferInitialTeam = () => {
    if (startingTeamKey === "A") return "teamB";
    if (startingTeamKey === "B") return "teamA";
    const firstTeam = sortedEvents[0]?.team;
    if (firstTeam === "teamA") return "teamB";
    if (firstTeam === "teamB") return "teamA";
    return "teamA";
  };

  let currentTeam = inferInitialTeam();
  let cursor = startTime;
  const segments = [];

  const pushSegment = (endTimeSegment, team) => {
    if (!Number.isFinite(endTimeSegment) || endTimeSegment <= cursor) return;
    segments.push({ start: cursor, end: endTimeSegment, team });
  };

  for (const event of sortedEvents) {
    const eventTime = Math.min(Math.max(event.time, startTime), endTime);
    pushSegment(eventTime, currentTeam);
    currentTeam = event.team || currentTeam;
    cursor = eventTime;
  }

  pushSegment(endTime, currentTeam);

  const totals = {
    teamA: { duration: 0, count: 0 },
    teamB: { duration: 0, count: 0 },
  };

  segments.forEach((segment) => {
    if (segment.team !== "teamA" && segment.team !== "teamB") return;
    const span = segment.end - segment.start;
    if (span > 0) {
      totals[segment.team].duration += span;
      totals[segment.team].count += 1;
    }
  });

  const totalDuration = totals.teamA.duration + totals.teamB.duration;
  return {
    averages: {
      teamA: totals.teamA.count > 0 ? totals.teamA.duration / totals.teamA.count : null,
      teamB: totals.teamB.count > 0 ? totals.teamB.duration / totals.teamB.count : null,
    },
    shares: {
      teamA: totalDuration > 0 ? (totals.teamA.duration / totalDuration) * 100 : null,
      teamB: totalDuration > 0 ? (totals.teamB.duration / totalDuration) * 100 : null,
    },
  };
}

function buildTimeTicks(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }

  const intervalMs = 5 * 60_000;
  const durationMs = end - start;
  const ticks = [];
  let offset = 0;

  while (offset <= durationMs) {
    const minutes = Math.round(offset / 60_000);
    ticks.push({ value: start + offset, label: `${minutes}'` });
    offset += intervalMs;
  }

  const lastTick = ticks[ticks.length - 1];
  if (!lastTick || lastTick.value !== end) {
    const minutes = Math.round(durationMs / 60_000);
    ticks.push({ value: end, label: `${minutes}'` });
  }

  return ticks;
}

function buildPossessionTimeline({
  turnovers,
  scoringPoints,
  axisStart,
  axisEnd,
  timeTicks,
  bands,
  startingTeamKey,
}) {
  if (!Number.isFinite(axisStart) || !Number.isFinite(axisEnd) || axisEnd <= axisStart) {
    return null;
  }

  const scoreFlipTurnovers = (scoringPoints || [])
    .filter((point) => Number.isFinite(point.time))
    .map((point) => ({
      time: Math.min(Math.max(point.time, axisStart), axisEnd),
      team: point.team === "teamA" ? "teamB" : point.team === "teamB" ? "teamA" : null,
      source: "score",
    }))
    .filter((entry) => entry.team && entry.time >= axisStart && entry.time <= axisEnd);

  const normalizedTurnovers = (turnovers || [])
    .filter((entry) => Number.isFinite(entry.time))
    .map((entry) => ({
      ...entry,
      time: Math.min(Math.max(entry.time, axisStart), axisEnd),
      source: entry.source || "turnover",
    }))
    .filter((entry) => entry.time >= axisStart && entry.time <= axisEnd);

  const sortedTurnovers = [...normalizedTurnovers, ...scoreFlipTurnovers].sort(
    (a, b) => a.time - b.time
  );

  const inferInitialTeam = () => {
    if (startingTeamKey === "A") return "teamB";
    if (startingTeamKey === "B") return "teamA";
    const firstTeam = sortedTurnovers[0]?.team;
    if (firstTeam === "teamA") return "teamB";
    if (firstTeam === "teamB") return "teamA";
    return null;
  };

  let currentTeam = inferInitialTeam();
  let cursor = axisStart;
  const segments = [];

  const pushSegment = (endTime, team) => {
    if (!Number.isFinite(endTime) || endTime <= cursor) return;
    segments.push({ start: cursor, end: endTime, team: team || null });
  };

  for (const turnover of sortedTurnovers) {
    pushSegment(turnover.time, currentTeam);
    currentTeam = turnover.team || null;
    cursor = turnover.time;
  }
  pushSegment(axisEnd, currentTeam);

  const interruptionBands = (bands || []).filter(
    (band) => band.type === "timeout" || band.type === "stoppage" || band.type === "halftime"
  );

  const applyBands = (baseSegments) => {
    if (!interruptionBands.length) return baseSegments;
    const output = [];
    for (const segment of baseSegments) {
      let pending = [segment];
      for (const band of interruptionBands) {
        const next = [];
        for (const piece of pending) {
          if (band.end <= piece.start || band.start >= piece.end) {
            next.push(piece);
            continue;
          }
          if (band.start > piece.start) {
            next.push({ ...piece, end: band.start });
          }
          const bandStart = Math.max(piece.start, band.start);
          const bandEnd = Math.min(piece.end, band.end);
          if (bandEnd > bandStart) {
            next.push({ start: bandStart, end: bandEnd, team: "band" });
          }
          if (band.end < piece.end) {
            next.push({ ...piece, start: band.end });
          }
        }
        pending = next;
      }
      output.push(...pending.filter((piece) => piece.end > piece.start));
    }
    return output;
  };

  const cleanedSegments = applyBands(segments);
  const scoreMarkers = (scoringPoints || [])
    .filter((point) => Number.isFinite(point.time))
    .map((point) => ({
      ...point,
      time: Math.min(Math.max(point.time, axisStart), axisEnd),
    }))
    .filter((point) => point.time >= axisStart && point.time <= axisEnd);

  return {
    minTime: axisStart,
    maxTime: axisEnd,
    segments: cleanedSegments,
    turnovers: sortedTurnovers,
    scores: scoreMarkers,
    timeTicks: timeTicks || buildTimeTicks(axisStart, axisEnd),
  };
}

export function deriveScrimmageReport({
  logs,
  teamAName,
  teamBName,
  startingTeamKey,
  startTime,
}) {
  const sortedLogs = [...(logs || [])]
    .map((entry) => ({
      ...entry,
      time: entry.timestamp ? new Date(entry.timestamp).getTime() : null,
    }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);

  const createStats = () => ({
    goalCounts: new Map(),
    assistCounts: new Map(),
    turnoverCounts: new Map(),
    connectionCounts: new Map(),
  });

  const teamStats = {
    teamA: createStats(),
    teamB: createStats(),
  };

  const createProductionTotals = () => ({
    holds: 0,
    cleanHolds: 0,
    breaks: 0,
    breakChances: 0,
    totalTurnovers: 0,
  });

  const teamProduction = {
    teamA: createProductionTotals(),
    teamB: createProductionTotals(),
  };

  const incrementCount = (map, name) => {
    const normalized = typeof name === "string" ? name.trim() : "";
    if (!normalized) return;
    map.set(normalized, (map.get(normalized) || 0) + 1);
  };

  const recordConnection = (stats, assist, scorer) => {
    const cleanedAssist = typeof assist === "string" ? assist.trim() : "";
    const cleanedScorer = typeof scorer === "string" ? scorer.trim() : "";
    if (!cleanedAssist || !cleanedScorer) return;
    const key = `${cleanedAssist}:::${cleanedScorer}`;
    stats.connectionCounts.set(key, (stats.connectionCounts.get(key) || 0) + 1);
  };

  const toTeamKey = (teamKey) => {
    if (teamKey === "A") return "teamA";
    if (teamKey === "B") return "teamB";
    return null;
  };

  const getOppositeTeam = (teamKey) => {
    if (teamKey === "teamA") return "teamB";
    if (teamKey === "teamB") return "teamA";
    return null;
  };

  const fallbackOffense = startingTeamKey === "B" ? "teamA" : "teamB";
  let pointStartingOffense = fallbackOffense;
  let pointStartingDefense = getOppositeTeam(pointStartingOffense);
  let currentPossession = pointStartingOffense;
  let pointTurnovers = 0;

  const resetPointState = (nextOffense) => {
    const normalized = nextOffense === "teamA" || nextOffense === "teamB" ? nextOffense : fallbackOffense;
    pointStartingOffense = normalized;
    pointStartingDefense = getOppositeTeam(normalized);
    currentPossession = pointStartingOffense;
    pointTurnovers = 0;
  };

  resetPointState(fallbackOffense);

  let scoreA = 0;
  let scoreB = 0;
  const scoringPoints = [];
  const turnovers = [];
  const halftimeEvents = [];
  const snapshots = [];
  const timestamps = [];
  const bands = [];
  const pendingBands = {
    timeout: null,
    stoppage: null,
    halftime: null,
  };

  let matchStartEventTime = null;
  let matchEndEventTime = null;
  let timelineStart = startTime ? new Date(startTime).getTime() : null;
  let timelineEnd = null;

  const pushSnapshot = (time) => {
    if (!Number.isFinite(time)) return;
    timestamps.push(time);
    snapshots.push({ time, scoreA, scoreB });
  };

  if (Number.isFinite(timelineStart)) {
    snapshots.push({ time: timelineStart, scoreA: 0, scoreB: 0 });
    timestamps.push(timelineStart);
  }

  sortedLogs.forEach((log) => {
    const code = log.eventCode;
    const timestamp = log.time;

    if (code === MATCH_LOG_EVENT_CODES.MATCH_START) {
      if (!matchStartEventTime || timestamp < matchStartEventTime) {
        matchStartEventTime = timestamp;
      }
      timelineStart = matchStartEventTime;
      if (!snapshots.some((entry) => entry.time === matchStartEventTime)) {
        snapshots.unshift({ time: matchStartEventTime, scoreA: 0, scoreB: 0 });
        timestamps.push(matchStartEventTime);
      }
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.MATCH_END) {
      if (!matchEndEventTime || timestamp > matchEndEventTime) {
        matchEndEventTime = timestamp;
      }
      timelineEnd = timestamp;
      pushSnapshot(timestamp);
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.HALFTIME_START) {
      halftimeEvents.push({ time: timestamp });
      pendingBands.halftime = timestamp;
      pushSnapshot(timestamp);
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.HALFTIME_END) {
      if (pendingBands.halftime) {
        bands.push({ type: "halftime", start: pendingBands.halftime, end: timestamp });
        pendingBands.halftime = null;
      }
      pushSnapshot(timestamp);
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.SCORE || code === MATCH_LOG_EVENT_CODES.CALAHAN) {
      const teamKey = toTeamKey(log.team);
      if (teamKey === "teamA") {
        scoreA += 1;
        scoringPoints.push({ team: "teamA", time: timestamp, score: scoreA });
      } else if (teamKey === "teamB") {
        scoreB += 1;
        scoringPoints.push({ team: "teamB", time: timestamp, score: scoreB });
      }

      if (teamKey) {
        if (teamKey === pointStartingOffense) {
          teamProduction[teamKey].holds += 1;
          if (pointTurnovers === 0) {
            teamProduction[teamKey].cleanHolds += 1;
          }
        } else if (teamKey === pointStartingDefense) {
          teamProduction[teamKey].breaks += 1;
        }

        const stats = teamStats[teamKey];
        incrementCount(stats.goalCounts, log.scorerName || log.scorerId);
        if (log.assistName && log.assistName !== "Callahan") {
          incrementCount(stats.assistCounts, log.assistName);
          recordConnection(stats, log.assistName, log.scorerName || log.scorerId || "");
        }
      }

      pushSnapshot(timestamp);
      const nextOffense = teamKey ? getOppositeTeam(teamKey) : fallbackOffense;
      resetPointState(nextOffense);
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.TURNOVER) {
      const gainingTeamKey = toTeamKey(log.team);
      const losingTeamKey = currentPossession || (gainingTeamKey ? getOppositeTeam(gainingTeamKey) : null);
      if (losingTeamKey) {
        teamProduction[losingTeamKey].totalTurnovers += 1;
        incrementCount(teamStats[losingTeamKey].turnoverCounts, log.actorName || log.actorId || "");
      }
      pointTurnovers += 1;
      if (pointStartingDefense && gainingTeamKey === pointStartingDefense) {
        teamProduction[pointStartingDefense].breakChances += 1;
      }
      if (gainingTeamKey) {
        currentPossession = gainingTeamKey;
        turnovers.push({ time: timestamp, team: gainingTeamKey });
      }
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.TIMEOUT_START) {
      pendingBands.timeout = timestamp;
      pushSnapshot(timestamp);
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.TIMEOUT_END) {
      if (pendingBands.timeout) {
        bands.push({ type: "timeout", start: pendingBands.timeout, end: timestamp });
        pendingBands.timeout = null;
      }
      pushSnapshot(timestamp);
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.STOPPAGE_START) {
      pendingBands.stoppage = timestamp;
      pushSnapshot(timestamp);
      return;
    }

    if (code === MATCH_LOG_EVENT_CODES.STOPPAGE_END) {
      if (pendingBands.stoppage) {
        bands.push({ type: "stoppage", start: pendingBands.stoppage, end: timestamp });
        pendingBands.stoppage = null;
      }
      pushSnapshot(timestamp);
    }
  });

  const fallbackStartTime = startTime ? new Date(startTime).getTime() : null;
  const defaultStart = Number.isFinite(timelineStart)
    ? timelineStart
    : Number.isFinite(fallbackStartTime)
      ? fallbackStartTime
      : timestamps.length > 0
        ? Math.min(...timestamps)
        : Date.now();

  let defaultEnd = Number.isFinite(timelineEnd)
    ? timelineEnd
    : timestamps.length > 0
      ? Math.max(...timestamps)
      : defaultStart + 5 * 60_000;

  if (defaultEnd <= defaultStart) {
    defaultEnd = defaultStart + 5 * 60_000;
  }

  const axisStart = Number.isFinite(matchStartEventTime) ? matchStartEventTime : defaultStart;
  let axisEnd = Number.isFinite(matchEndEventTime) ? matchEndEventTime : defaultEnd;
  if (axisEnd <= axisStart) {
    axisEnd = axisStart + 5 * 60_000;
  }

  if (!snapshots.some((entry) => entry.time === axisStart)) {
    snapshots.unshift({ time: axisStart, scoreA: 0, scoreB: 0 });
    timestamps.push(axisStart);
  }
  if (!snapshots.some((entry) => entry.time === axisEnd)) {
    snapshots.push({ time: axisEnd, scoreA, scoreB });
    timestamps.push(axisEnd);
  }

  Object.entries(pendingBands).forEach(([type, start]) => {
    if (start) {
      bands.push({ type, start, end: axisEnd });
    }
  });

  const boundedSnapshots = [...snapshots]
    .sort((a, b) => a.time - b.time)
    .filter((entry) => entry.time >= axisStart && entry.time <= axisEnd);

  const boundedScoringPoints = scoringPoints.filter(
    (point) => point.time >= axisStart && point.time <= axisEnd
  );

  const boundedBands = bands
    .map((band) => {
      const start = Math.max(axisStart, band.start);
      const end = Math.min(axisEnd, band.end);
      if (!(Number.isFinite(start) && Number.isFinite(end))) {
        return null;
      }
      return start < end ? { ...band, start, end } : null;
    })
    .filter(Boolean);

  const timeTicks = buildTimeTicks(axisStart, axisEnd);
  const timeline = {
    minTime: axisStart,
    maxTime: axisEnd,
    maxScore: Math.max(scoreA, scoreB),
    series: {
      teamA: boundedSnapshots.map((entry) => ({ time: entry.time, score: entry.scoreA })),
      teamB: boundedSnapshots.map((entry) => ({ time: entry.time, score: entry.scoreB })),
    },
    scoringPoints: boundedScoringPoints,
    bands: boundedBands,
    timeTicks,
  };

  const possessionTimeline = buildPossessionTimeline({
    turnovers,
    scoringPoints: boundedScoringPoints,
    axisStart,
    axisEnd,
    timeTicks,
    bands: boundedBands,
    startingTeamKey,
  });

  const duration =
    Number.isFinite(axisStart) && Number.isFinite(axisEnd)
      ? axisEnd - axisStart
      : null;

  const matchRows = [
    { label: "Match date", value: formatMatchDate(axisStart) },
    { label: "Match start", value: formatTimeLabel(axisStart, true) },
  ];

  if (halftimeEvents.length > 0) {
    halftimeEvents.forEach((half, index) => {
      const elapsedMs =
        Number.isFinite(half.time) && Number.isFinite(matchStartEventTime)
          ? half.time - matchStartEventTime
          : null;
      const elapsedMinutes = Number.isFinite(elapsedMs) ? Math.round(elapsedMs / 60000) : null;
      const label = halftimeEvents.length > 1 ? `Halftime ${index + 1}` : "Halftime";
      matchRows.push({
        label,
        value: Number.isFinite(elapsedMinutes) ? `${elapsedMinutes} min` : "--",
      });
    });
  }

  const firstPoint = boundedScoringPoints[0]?.time ?? null;
  const lastPoint = boundedScoringPoints[boundedScoringPoints.length - 1]?.time ?? null;

  matchRows.push(
    { label: "First point", value: formatTimeLabel(firstPoint, true) },
    { label: "Last point", value: formatTimeLabel(lastPoint, true) },
    {
      label: "Match duration",
      value: (() => {
        const base = formatDurationLong(duration);
        const minutes = Number.isFinite(duration) ? Math.round(duration / 60000) : null;
        return Number.isFinite(minutes) ? `${base} (${minutes} min)` : base;
      })(),
    },
  );

  const averageTempo = (() => {
    if (
      boundedScoringPoints.length < 2 ||
      !Number.isFinite(firstPoint) ||
      !Number.isFinite(lastPoint)
    ) {
      return null;
    }
    return (lastPoint - firstPoint) / (boundedScoringPoints.length - 1);
  })();

  const teamAverageGap = (teamKey) => {
    const times = boundedScoringPoints
      .filter((point) => point.team === teamKey)
      .map((point) => point.time);
    if (times.length < 2) return null;
    let total = 0;
    for (let i = 1; i < times.length; i += 1) {
      total += times[i] - times[i - 1];
    }
    return total / (times.length - 1);
  };

  const teamAGap = teamAverageGap("teamA");
  const teamBGap = teamAverageGap("teamB");

  const possessionMetrics = buildPossessionMetrics({
    startTime: axisStart,
    endTime: axisEnd,
    startingTeamKey,
    turnovers,
    scoringPoints: boundedScoringPoints,
  });

  const avgTurnsPerPoint =
    boundedScoringPoints.length > 0 && turnovers.length > 0
      ? turnovers.length / boundedScoringPoints.length
      : null;

  const formatMsShort = (ms) => (Number.isFinite(ms) && ms > 0 ? formatGap(ms) : "--");
  const formatRatio = (value, decimals = 2) =>
    Number.isFinite(value) && value >= 0 ? value.toFixed(decimals) : "--";
  const formatPercent = (value, decimals = 1) =>
    Number.isFinite(value) && value >= 0 ? `${value.toFixed(decimals)}%` : "--";

  const tempoRows = [
    { label: "Avg time per point", value: averageTempo ? formatGap(averageTempo) : "--" },
    { label: `${teamAName} scoring gap`, value: teamAGap ? formatGap(teamAGap) : "--" },
    { label: `${teamBName} scoring gap`, value: teamBGap ? formatGap(teamBGap) : "--" },
  ];

  if (possessionMetrics?.averages) {
    tempoRows.push(
      {
        label: `${teamAName} avg possession`,
        value: formatMsShort(possessionMetrics.averages.teamA),
      },
      {
        label: `${teamBName} avg possession`,
        value: formatMsShort(possessionMetrics.averages.teamB),
      },
    );
  }

  if (possessionMetrics?.shares) {
    tempoRows.push(
      {
        label: `${teamAName} possession %`,
        value: formatPercent(possessionMetrics.shares.teamA),
      },
      {
        label: `${teamBName} possession %`,
        value: formatPercent(possessionMetrics.shares.teamB),
      },
    );
  }

  if (Number.isFinite(avgTurnsPerPoint)) {
    tempoRows.push({ label: "Avg turns per point", value: formatRatio(avgTurnsPerPoint) });
  }

  return {
    timeline,
    possessionTimeline,
    insights: {
      match: matchRows,
      tempo: tempoRows,
    },
    summaries: {
      teamA: {
        goals: mapToSortedList(teamStats.teamA.goalCounts),
        assists: mapToSortedList(teamStats.teamA.assistCounts),
        turnovers: mapToSortedList(teamStats.teamA.turnoverCounts),
        connections: mapToConnections(teamStats.teamA.connectionCounts),
        production: { ...teamProduction.teamA },
      },
      teamB: {
        goals: mapToSortedList(teamStats.teamB.goalCounts),
        assists: mapToSortedList(teamStats.teamB.assistCounts),
        turnovers: mapToSortedList(teamStats.teamB.turnoverCounts),
        connections: mapToConnections(teamStats.teamB.connectionCounts),
        production: { ...teamProduction.teamB },
      },
    },
  };
}
