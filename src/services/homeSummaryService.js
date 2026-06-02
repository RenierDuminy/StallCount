import { getEventsList } from "./leagueService";
import {
  getOpenMatches,
  getRecentFinalMatches,
  getRecentMatches,
  getRecentMatchesWithMedia,
} from "./matchService";
import { getRecentLiveEvents } from "./liveEventService";
import { getTableCount } from "./statsService";
import { getAllTeams } from "./teamService";
import { getCachedQuery } from "../utils/queryCache";

const HOME_HERO_SUMMARY_CACHE_TTL_MS = 30 * 1000;
const HOME_BELOW_FOLD_SUMMARY_CACHE_TTL_MS = 60 * 1000;
const HOME_STREAMING_SUMMARY_CACHE_TTL_MS = 30 * 1000;
const HOME_FINALS_SUMMARY_CACHE_TTL_MS = 60 * 1000;

const DEFAULT_HOME_HERO_LIMITS = {
  openMatches: 12,
  liveEvents: 24,
};

const DEFAULT_HOME_BELOW_FOLD_LIMITS = {
  teams: 8,
  events: 16,
};

const DEFAULT_HOME_STREAMING_LIMITS = {
  recentMatches: 12,
  broadcastMatches: 5,
};

const DEFAULT_HOME_FINALS_LIMITS = {
  finalMatches: 16,
};

function normalizeLimit(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeHomeHeroLimits(limits = {}) {
  return {
    openMatches: normalizeLimit(limits.openMatches, DEFAULT_HOME_HERO_LIMITS.openMatches),
    liveEvents: normalizeLimit(limits.liveEvents, DEFAULT_HOME_HERO_LIMITS.liveEvents),
  };
}

function normalizeHomeBelowFoldLimits(limits = {}) {
  return {
    teams: normalizeLimit(limits.teams, DEFAULT_HOME_BELOW_FOLD_LIMITS.teams),
    events: normalizeLimit(limits.events, DEFAULT_HOME_BELOW_FOLD_LIMITS.events),
  };
}

function normalizeHomeStreamingLimits(limits = {}) {
  return {
    recentMatches: normalizeLimit(limits.recentMatches, DEFAULT_HOME_STREAMING_LIMITS.recentMatches),
    broadcastMatches: normalizeLimit(limits.broadcastMatches, DEFAULT_HOME_STREAMING_LIMITS.broadcastMatches),
  };
}

function normalizeHomeFinalsLimits(limits = {}) {
  return {
    finalMatches: normalizeLimit(limits.finalMatches, DEFAULT_HOME_FINALS_LIMITS.finalMatches),
  };
}

function buildHomeHeroSummaryCacheKey(limits) {
  return [
    "home-summary:hero",
    `open=${limits.openMatches}`,
    `live=${limits.liveEvents}`,
  ].join(":");
}

function buildHomeBelowFoldSummaryCacheKey(limits) {
  return [
    "home-summary:below-fold",
    `teams=${limits.teams}`,
    `events=${limits.events}`,
  ].join(":");
}

function buildHomeStreamingSummaryCacheKey(limits) {
  return [
    "home-summary:streaming",
    `recent=${limits.recentMatches}`,
    `broadcast=${limits.broadcastMatches}`,
  ].join(":");
}

function buildHomeFinalsSummaryCacheKey(limits) {
  return [
    "home-summary:finals",
    `final=${limits.finalMatches}`,
  ].join(":");
}

function toSettled(promise) {
  return promise
    .then((value) => ({ status: "fulfilled", value }))
    .catch((reason) => ({ status: "rejected", reason }));
}

function getFulfilledValue(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function collectHomeSummaryFailures(results, labels) {
  return results
    .map((result, index) => {
      if (result.status === "fulfilled") return null;
      return {
        key: labels[index],
        message: result.reason?.message || `Failed to load ${labels[index]}.`,
      };
    })
    .filter(Boolean);
}

export async function getHomeSummary(options = {}) {
  const heroSummary = await getHomeHeroSummary(options);
  const belowFoldSummary = await getHomeBelowFoldSummary(options);

  return {
    ...belowFoldSummary,
    openMatches: heroSummary.openMatches,
    liveEvents: heroSummary.liveEvents,
    failures: [...heroSummary.failures, ...belowFoldSummary.failures],
    loadedAt: new Date().toISOString(),
  };
}

export async function getHomeHeroSummary(options = {}) {
  const limits = normalizeHomeHeroLimits(options.limits);
  const cacheKey = buildHomeHeroSummaryCacheKey(limits);

  return getCachedQuery(
    cacheKey,
    async () => {
      const results = await Promise.all([
        toSettled(getOpenMatches(limits.openMatches)),
        toSettled(getRecentLiveEvents(limits.liveEvents)),
      ]);

      const [
        openMatchesResult,
        liveEventsResult,
      ] = results;

      return {
        openMatches: getFulfilledValue(openMatchesResult, []),
        liveEvents: getFulfilledValue(liveEventsResult, []),
        failures: collectHomeSummaryFailures(results, ["upcoming matches", "live events"]),
        loadedAt: new Date().toISOString(),
      };
    },
    { ttlMs: HOME_HERO_SUMMARY_CACHE_TTL_MS, refreshOnPageReload: false },
  );
}

export async function getHomeBelowFoldSummary(options = {}) {
  const limits = normalizeHomeBelowFoldLimits(options.limits);
  const cacheKey = buildHomeBelowFoldSummaryCacheKey(limits);

  return getCachedQuery(
    cacheKey,
    async () => {
      const results = await Promise.all([
        toSettled(getAllTeams(limits.teams)),
        toSettled(getEventsList(limits.events)),
        toSettled(getTableCount("player")),
        toSettled(getTableCount("teams")),
        toSettled(getTableCount("events")),
      ]);

      const [
        teamsResult,
        eventsResult,
        playersCountResult,
        teamsCountResult,
        eventsCountResult,
      ] = results;

      return {
        teams: getFulfilledValue(teamsResult, []),
        events: getFulfilledValue(eventsResult, []),
        stats: {
          players: getFulfilledValue(playersCountResult, 0),
          teams: getFulfilledValue(teamsCountResult, 0),
          events: getFulfilledValue(eventsCountResult, 0),
        },
        failures: collectHomeSummaryFailures(results, [
          "teams",
          "events",
          "players count",
          "teams count",
          "events count",
        ]),
        loadedAt: new Date().toISOString(),
      };
    },
    { ttlMs: HOME_BELOW_FOLD_SUMMARY_CACHE_TTL_MS, refreshOnPageReload: false },
  );
}

export async function getHomeStreamingSummary(options = {}) {
  const limits = normalizeHomeStreamingLimits(options.limits);
  const cacheKey = buildHomeStreamingSummaryCacheKey(limits);

  return getCachedQuery(
    cacheKey,
    async () => {
      const results = await Promise.all([
        toSettled(getRecentMatches(limits.recentMatches)),
        toSettled(getRecentMatchesWithMedia(limits.broadcastMatches)),
      ]);

      const [
        latestMatchesResult,
        recentBroadcastMatchesResult,
      ] = results;

      return {
        latestMatches: getFulfilledValue(latestMatchesResult, []),
        recentBroadcastMatches: getFulfilledValue(recentBroadcastMatchesResult, []),
        failures: collectHomeSummaryFailures(results, ["recent matches", "matches with media"]),
        loadedAt: new Date().toISOString(),
      };
    },
    { ttlMs: HOME_STREAMING_SUMMARY_CACHE_TTL_MS, refreshOnPageReload: false },
  );
}

export async function getHomeFinalsSummary(options = {}) {
  const limits = normalizeHomeFinalsLimits(options.limits);
  const cacheKey = buildHomeFinalsSummaryCacheKey(limits);

  return getCachedQuery(
    cacheKey,
    async () => {
      const results = await Promise.all([
        toSettled(getRecentFinalMatches(limits.finalMatches)),
      ]);

      const [recentFinalMatchesResult] = results;

      return {
        recentFinalMatches: getFulfilledValue(recentFinalMatchesResult, []),
        failures: collectHomeSummaryFailures(results, ["recent final matches"]),
        loadedAt: new Date().toISOString(),
      };
    },
    { ttlMs: HOME_FINALS_SUMMARY_CACHE_TTL_MS, refreshOnPageReload: false },
  );
}
