import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getPlayerMatchStats, getTeamsByIds, getTeamMatches } from "../services/teamService";
import { getPlayersByIds } from "../services/playerService";
import {
  getMatchesByIds,
} from "../services/matchService";
import { getSubscriptions } from "../services/subscriptionService";
import { useAuth } from "../context/AuthContext";
import {
  getHomeBelowFoldSummary,
  getHomeFinalsSummary,
  getHomeHeroSummary,
  getHomeStreamingSummary,
} from "../services/homeSummaryService";
import { useHomeLiveRefresh } from "../hooks/useHomeLiveRefresh";
import usePersistentState from "../hooks/usePersistentState";
import {
  hasMatchMedia,
} from "../utils/matchMedia";
import {
  CLOSED_STATUSES,
  CONCLUDED_STATUSES,
  IN_PROGRESS_STATUSES,
  PENDING_STATUSES,
  isClosedStatus,
} from "../constants/statusCodes";
import { HomeEventList } from "./home/HomeEventList";
import { HomeFeaturedMatch } from "./home/HomeFeaturedMatch";
import { HomeAgendaList, HomeResultList, HomeWatchList } from "./home/HomeMatchLists";
import { HomeQuickLinks } from "./home/HomeQuickLinks";
import { HomeNotice, HomeSectionHeader, HomeSkeleton } from "./home/HomeSectionHeader";
import { HomeWelcome } from "./home/HomeWelcome";
import { HomeYourTeams } from "./home/HomeYourTeams";
import { HomeNotificationsPromo } from "./home/HomeNotificationsPromo";
import {
  buildMatchLink,
  compareByStartTime,
  formatMatchup,
  isMatchFinal,
  isMatchLive,
  toTime,
} from "./home/homeFormat";

const FINISHED_STATUSES = new Set(CONCLUDED_STATUSES);
const MAX_MY_TEAMS = 2;
const MAX_MY_MATCHES = 3;
const MAX_MY_PLAYERS = 3;
// `finalMatches` / `broadcastMatches` / `recentMatches` are fetch sizes;
// `results` / `watch` / `upcomingMatches` are how many rows are shown.
const DESKTOP_HOME_LIMITS = {
  events: 40,
  recentMatches: 50,
  openMatches: 20,
  broadcastMatches: 5,
  finalMatches: 16,
  results: 8,
  liveEvents: 50,
  activeEvents: 5,
  timelineEvents: 8,
  streamMatches: 5,
  watch: 6,
  upcomingMatches: 10,
};
const MOBILE_HOME_LIMITS = {
  events: 12,
  recentMatches: 12,
  openMatches: 8,
  broadcastMatches: 3,
  finalMatches: 8,
  results: 5,
  liveEvents: 10,
  activeEvents: 5,
  timelineEvents: 4,
  streamMatches: 3,
  watch: 4,
  upcomingMatches: 6,
};
const HOME_LAZY_SECTION_ROOT_MARGIN = "700px 0px";
const STALE_FIXTURE_MS = 12 * 60 * 60 * 1000;
const COMPACT_HOME_QUERY = "(max-width: 640px)";
// Matches the desktop breakpoint in theme.css (.home-columns).
const WIDE_HOME_QUERY = "(min-width: 1024px)";
const WELCOME_DISMISSED_KEY = "home:welcome-dismissed";

function LazyHomeSection({
  children,
  className = "",
  id,
  onVisible,
  placeholderHeight = 360,
  rootMargin = HOME_LAZY_SECTION_ROOT_MARGIN,
}) {
  const ref = useRef(null);
  const onVisibleRef = useRef(onVisible);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    if (isVisible) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      onVisibleRef.current?.();
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsVisible(true);
        onVisibleRef.current?.();
        observer.disconnect();
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  // A section that renders nothing once loaded leaves this wrapper empty, and
  // `.home-lazy-section:empty` collapses it — so empty sections take no space.
  return (
    <div ref={ref} id={id} className={`home-lazy-section ${className}`}>
      {isVisible ? children : <div aria-hidden="true" style={{ minHeight: placeholderHeight }} />}
    </div>
  );
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);
    setMatches(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [query]);

  return matches;
}

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [latestMatches, setLatestMatches] = useState([]);
  const [openMatches, setOpenMatches] = useState([]);
  const [recentBroadcastMatches, setRecentBroadcastMatches] = useState([]);
  const [recentFinalMatches, setRecentFinalMatches] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [stats, setStats] = useState({ teams: 0, players: 0, events: 0 });
  const [loading, setLoading] = useState(true);
  const [belowFoldLoading, setBelowFoldLoading] = useState(true);
  const [error, setError] = useState(null);
  const [belowFoldError, setBelowFoldError] = useState(null);
  const [heroActionStatus, setHeroActionStatus] = useState(null);

  const [subscriptions, setSubscriptions] = useState([]);
  const [personalizedLoading, setPersonalizedLoading] = useState(false);
  const [personalizedError, setPersonalizedError] = useState(null);
  const [personalizedMessage, setPersonalizedMessage] = useState(null);
  const [myTeamInsights, setMyTeamInsights] = useState([]);
  const [myMatchInsights, setMyMatchInsights] = useState([]);
  const [myTeamsLoading, setMyTeamsLoading] = useState(false);
  const [myPlayerInsights, setMyPlayerInsights] = useState([]);
  const [myPlayersLoading, setMyPlayersLoading] = useState(false);
  const [myMatchesLoading, setMyMatchesLoading] = useState(false);

  const [renderStreaming, setRenderStreaming] = useState(false);
  const [renderFinals, setRenderFinals] = useState(false);
  const [renderEventTimeline, setRenderEventTimeline] = useState(false);
  const [renderPersonalized, setRenderPersonalized] = useState(false);
  // Start true: these sections render only once their data is in, and hide
  // entirely when it comes back empty, so "not loaded yet" must not read as
  // "loaded and empty".
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [finalsLoading, setFinalsLoading] = useState(true);
  const isCompactHome = useMediaQuery(COMPACT_HOME_QUERY);
  const isWideHome = useMediaQuery(WIDE_HOME_QUERY);
  const [welcomeDismissed, setWelcomeDismissed] = usePersistentState(WELCOME_DISMISSED_KEY, false);

  const { session, loading: authLoading } = useAuth();
  const isLoggedIn = Boolean(session?.user);
  // Wait for the session check so a returning signed-in user doesn't see the
  // introduction flash up and disappear.
  const showWelcome = !authLoading && !isLoggedIn && !welcomeDismissed;
  const homeLimits = useMemo(
    () => (isCompactHome ? MOBILE_HOME_LIMITS : DESKTOP_HOME_LIMITS),
    [isCompactHome],
  );

  useEffect(() => {
    if (!heroActionStatus) return;
    const timer = setTimeout(() => setHeroActionStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [heroActionStatus]);

  useEffect(() => {
    if (!personalizedMessage) return;
    const timer = setTimeout(() => setPersonalizedMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [personalizedMessage]);

  // Shared by the initial load and every live/idle refresh. A background
  // refresh must not flip the page back into its loading state or clear the
  // cards already on screen, so `background` suppresses the spinner and keeps
  // the last good data visible if the refetch fails.
  const loadHeroData = useCallback(
    async ({ background = false, signal } = {}) => {
      if (!background) {
        setLoading(true);
        setError(null);
      }

      try {
        const summary = await getHomeHeroSummary({
          limits: {
            openMatches: homeLimits.openMatches,
            liveEvents: homeLimits.liveEvents,
          },
          forceRefresh: background,
        });

        if (signal?.cancelled) return;

        setOpenMatches(summary.openMatches);
        setLiveEvents(summary.liveEvents);

        if (summary.failures.length > 0) {
          summary.failures.forEach((failure) => {
            console.error(`[HomePage] ${failure.message}`);
          });
          const criticalFailures = summary.failures
            .map((failure) => failure.key)
            .filter((key) => key !== "live events");
          if (criticalFailures.length > 0 && !background) {
            setError(`Unable to load ${criticalFailures.join(", ")}. Please refresh and try again.`);
          }
        } else if (background) {
          // A successful background refresh clears a stale error banner left
          // over from an earlier failed load.
          setError(null);
        }
      } catch (err) {
        if (signal?.cancelled) return;
        console.error("[HomePage] Unexpected load error:", err);
        if (!background) {
          setError(err?.message || "Unable to load league data.");
        }
      } finally {
        if (!signal?.cancelled && !background) {
          setLoading(false);
        }
      }
    },
    [homeLimits.liveEvents, homeLimits.openMatches],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void loadHeroData({ signal });
    return () => {
      signal.cancelled = true;
    };
  }, [loadHeroData]);

  // The welcome band shows the site-wide counts, which come from the same
  // summary as the events list — so while it is up, fetch now rather than
  // waiting for the events section to scroll into view.
  const loadBelowFold = renderEventTimeline || showWelcome;

  useEffect(() => {
    if (!loadBelowFold) return undefined;

    let ignore = false;

    async function loadBelowFoldData() {
      setBelowFoldLoading(true);
      setBelowFoldError(null);
      try {
        const summary = await getHomeBelowFoldSummary({
          limits: {
            events: homeLimits.events,
          },
        });

        if (ignore) return;

        setEvents(summary.events);
        setStats(summary.stats);

        if (summary.failures.length > 0) {
          summary.failures.forEach((failure) => {
            console.error(`[HomePage] ${failure.message}`);
          });
          setBelowFoldError(
            `Unable to load ${summary.failures.map((failure) => failure.key).join(", ")}. Please refresh and try again.`,
          );
        }
      } catch (err) {
        if (!ignore) {
          console.error("[HomePage] Failed to load below-the-fold summary:", err);
          setBelowFoldError(err?.message || "Unable to load event data.");
        }
      } finally {
        if (!ignore) {
          setBelowFoldLoading(false);
        }
      }
    }

    loadBelowFoldData();

    return () => {
      ignore = true;
    };
  }, [homeLimits.events, loadBelowFold]);

  useEffect(() => {
    if (!renderStreaming) return undefined;

    let ignore = false;

    async function loadStreamData() {
      setStreamsLoading(true);
      try {
        const summary = await getHomeStreamingSummary({
          limits: {
            recentMatches: homeLimits.recentMatches,
            broadcastMatches: homeLimits.broadcastMatches,
          },
        });

        if (ignore) return;

        setLatestMatches(summary.latestMatches);
        setRecentBroadcastMatches(summary.recentBroadcastMatches);

        if (summary.failures.length > 0) {
          summary.failures.forEach((failure) => {
            console.error(`[HomePage] ${failure.message}`);
          });
        }
      } catch (err) {
        if (!ignore) {
          console.error("[HomePage] Unable to load streaming data:", err);
        }
      } finally {
        if (!ignore) {
          setStreamsLoading(false);
        }
      }
    }

    loadStreamData();

    return () => {
      ignore = true;
    };
  }, [homeLimits.broadcastMatches, homeLimits.recentMatches, renderStreaming]);

  useEffect(() => {
    if (!renderFinals) return undefined;

    let ignore = false;
    setFinalsLoading(true);

    getHomeFinalsSummary({ limits: { finalMatches: homeLimits.finalMatches } })
      .then((summary) => {
        if (!ignore) {
          setRecentFinalMatches(summary.recentFinalMatches);
          if (summary.failures.length > 0) {
            summary.failures.forEach((failure) => {
              console.error(`[HomePage] ${failure.message}`);
            });
          }
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("[HomePage] Failed to load recent final matches:", err);
          setRecentFinalMatches([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setFinalsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [homeLimits.finalMatches, renderFinals]);

  useEffect(() => {
    const profileId = session?.user?.id ?? null;

    if (!profileId) {
      setSubscriptions([]);
      setMyTeamInsights([]);
      setMyPlayerInsights([]);
      setMyMatchInsights([]);
      setPersonalizedLoading(false);
      setPersonalizedError(null);
      return;
    }

    if (!renderPersonalized) {
      setPersonalizedLoading(false);
      setPersonalizedError(null);
      return;
    }

    let ignore = false;
    setPersonalizedLoading(true);
    setPersonalizedError(null);

    toSettled(getSubscriptions(profileId))
      .then((subscriptionsResult) => {
        if (ignore) return;

        if (subscriptionsResult.status === "fulfilled") {
          setSubscriptions(subscriptionsResult.value);
        } else {
          setSubscriptions([]);
          console.error("[HomePage] Failed to load subscriptions:", subscriptionsResult.reason);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setPersonalizedError(err?.message || "Unable to load your personal data.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setPersonalizedLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [renderPersonalized, session?.user?.id]);
  const followedTeamIds = useMemo(() => {
    return Array.from(
      new Set(
        (subscriptions || [])
          .filter((sub) => normalizeTargetType(sub.target_type) === "team")
          .map((sub) => sub.target_id)
          .filter(Boolean),
      ),
    );
  }, [subscriptions]);

  const followedMatchIds = useMemo(() => {
    return Array.from(
      new Set(
        (subscriptions || [])
          .filter((sub) => normalizeTargetType(sub.target_type) === "match")
          .map((sub) => sub.target_id)
          .filter(Boolean),
      ),
    );
  }, [subscriptions]);

  const followedPlayerIds = useMemo(() => {
    return Array.from(
      new Set(
        (subscriptions || [])
          .filter((sub) => normalizeTargetType(sub.target_type) === "player")
          .map((sub) => sub.target_id)
          .filter(Boolean),
      ),
    );
  }, [subscriptions]);

  useEffect(() => {
    const teamIds = followedTeamIds.slice(0, MAX_MY_TEAMS);

    if (teamIds.length === 0) {
      setMyTeamInsights([]);
      setMyTeamsLoading(false);
      return;
    }

    let ignore = false;
    setMyTeamsLoading(true);

    async function loadMyTeams() {
      try {
        const settled = await Promise.all([
          toSettled(getTeamsByIds(teamIds)),
          ...teamIds.map((teamId) => toSettled(getTeamMatches(teamId))),
        ]);

        if (ignore) return;

        const [teamRowsResult, ...matchesResults] = settled;

        const teamLookup =
          teamRowsResult.status === "fulfilled"
            ? new Map((teamRowsResult.value || []).map((team) => [team.id, team]))
            : new Map();

        if (teamRowsResult.status !== "fulfilled") {
          console.error("[HomePage] Failed to load personalized team info:", teamRowsResult.reason);
        }

        const insights = teamIds
          .map((teamId, index) => {
            const matchesResult = matchesResults[index];
            if (matchesResult?.status !== "fulfilled") {
              console.error("[HomePage] Failed to load matches for team:", teamId, matchesResult?.reason);
              return null;
            }
            const matches = matchesResult.value || [];
            const record = computeTeamRecord(matches, teamId);
            const nextFixture = pickNextFixture(matches, teamId);
            const lastResult = pickLastResult(matches, teamId);
            const name =
              teamLookup.get(teamId)?.name ||
              matches.find((match) => match.team_a?.id === teamId)?.team_a?.name ||
              matches.find((match) => match.team_b?.id === teamId)?.team_b?.name ||
              "Team";
            return { teamId, name, record, nextFixture, lastResult };
          })
          .filter(Boolean);

        setMyTeamInsights(insights);
      } catch (err) {
        if (!ignore) {
          console.error("[HomePage] Unable to load personalized team data:", err);
          setMyTeamInsights([]);
        }
      } finally {
        if (!ignore) {
          setMyTeamsLoading(false);
        }
      }
    }

    loadMyTeams();

    return () => {
      ignore = true;
    };
  }, [followedTeamIds]);

  // Followed players: the player row supplies the name even for someone with
  // no games yet; per-match stats supply team, goals, assists and games.
  useEffect(() => {
    const playerIds = followedPlayerIds.slice(0, MAX_MY_PLAYERS);

    if (playerIds.length === 0) {
      setMyPlayerInsights([]);
      setMyPlayersLoading(false);
      return;
    }

    let ignore = false;
    setMyPlayersLoading(true);

    async function loadMyPlayers() {
      try {
        const [playerRowsResult, ...statsResults] = await Promise.all([
          toSettled(getPlayersByIds(playerIds)),
          ...playerIds.map((playerId) => toSettled(getPlayerMatchStats(playerId))),
        ]);

        if (ignore) return;

        if (playerRowsResult.status !== "fulfilled") {
          console.error("[HomePage] Failed to load followed players:", playerRowsResult.reason);
        }
        const playerLookup =
          playerRowsResult.status === "fulfilled"
            ? new Map((playerRowsResult.value || []).map((player) => [player.id, player]))
            : new Map();

        const insights = playerIds
          .map((playerId, index) => {
            const statsResult = statsResults[index];
            if (statsResult?.status !== "fulfilled") {
              console.error("[HomePage] Failed to load stats for player:", playerId, statsResult?.reason);
            }
            const statRows = statsResult?.status === "fulfilled" ? statsResult.value || [] : [];
            const playerRow = playerLookup.get(playerId) || null;
            if (!playerRow && statRows.length === 0) return null;
            return computePlayerInsight(playerId, playerRow, statRows);
          })
          .filter(Boolean);

        setMyPlayerInsights(insights);
      } catch (err) {
        if (!ignore) {
          console.error("[HomePage] Unable to load followed players:", err);
          setMyPlayerInsights([]);
        }
      } finally {
        if (!ignore) {
          setMyPlayersLoading(false);
        }
      }
    }

    loadMyPlayers();

    return () => {
      ignore = true;
    };
  }, [followedPlayerIds]);

  useEffect(() => {
    const matchIds = followedMatchIds.slice(0, MAX_MY_MATCHES);

    if (matchIds.length === 0) {
      setMyMatchInsights([]);
      setMyMatchesLoading(false);
      return;
    }

    let ignore = false;
    setMyMatchesLoading(true);

    getMatchesByIds(matchIds)
      .then((rows) => {
        if (!ignore) {
          setMyMatchInsights(rows || []);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("[HomePage] Unable to load tracked matches:", err);
          setPersonalizedMessage(err?.message || "Unable to load your tracked matches.");
          setMyMatchInsights([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setMyMatchesLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [followedMatchIds]);

  const safeEvents = useMemo(() => events ?? [], [events]);
  const safeLatestMatches = useMemo(() => latestMatches ?? [], [latestMatches]);
  // Matches on closed events are dropped here rather than at each call site, so
  // the hero and "Coming up" agree — a match left in `scheduled` on a
  // wrapped-up event should not be featured anywhere on the landing page.
  const safeOpenMatches = useMemo(
    () => (openMatches ?? []).filter((match) => !isMatchFromClosedEvent(match)),
    [openMatches],
  );
  const safeLiveEvents = useMemo(() => liveEvents ?? [], [liveEvents]);

  const liveEventLookup = useMemo(() => {
    const map = new Map();
    safeLiveEvents.forEach((evt) => {
      if (!map.has(evt.match_id)) {
        map.set(evt.match_id, evt);
      }
    });
    return map;
  }, [safeLiveEvents]);

  const liveHeroMatches = useMemo(() => {
    return safeOpenMatches.filter((match) => isMatchLive(match?.status)).sort(compareByStartTime);
  }, [safeOpenMatches]);

  const liveNowMatch = liveHeroMatches[0] || null;

  // Drives the live/idle cadence. While any match is live we hold a realtime
  // channel and poll every 30 s as a backstop; once the last one finishes this
  // flips false, the channel is torn down and we fall back to a ~10 min poll
  // that is what eventually notices the next scheduled match kicking off.
  const hasLiveMatches = liveHeroMatches.length > 0;

  const handleLiveRefresh = useCallback(
    () => loadHeroData({ background: true }),
    [loadHeroData],
  );

  useHomeLiveRefresh({
    hasLiveMatches,
    onRefresh: handleLiveRefresh,
  });

  const nextMatchCandidate = useMemo(() => {
    if (liveNowMatch) return null;
    const now = Date.now();
    return (
      safeOpenMatches
        .filter((match) => !FINISHED_STATUSES.has((match?.status || "").toLowerCase()))
        .filter((match) => {
          const startTime = toTime(match?.start_time);
          return startTime === null || startTime > now;
        })
        .sort(compareByStartTime)[0] || null
    );
  }, [safeOpenMatches, liveNowMatch]);

  const heroIsLive = Boolean(liveNowMatch);
  const heroFeaturedMatches = useMemo(
    () => (heroIsLive ? liveHeroMatches : nextMatchCandidate ? [nextMatchCandidate] : []),
    [heroIsLive, liveHeroMatches, nextMatchCandidate],
  );
  const showMultiLiveHero = heroFeaturedMatches.length > 1;

  // Everything open that isn't already featured above, live first, then by
  // kick-off. Grouped by day at render time.
  //
  // A pending match whose kick-off is well in the past is almost always one
  // nobody marked as played, not one that is "coming up" — leading the list
  // with last week's fixtures is exactly what confuses a first-time visitor.
  // Those stay visible on /matches; live matches are never dropped.
  const comingUpMatches = useMemo(() => {
    const featuredIds = new Set(heroFeaturedMatches.map((match) => match?.id).filter(Boolean));
    const staleBefore = Date.now() - STALE_FIXTURE_MS;
    const remaining = safeOpenMatches.filter((match) => !featuredIds.has(match?.id));
    const live = remaining.filter((match) => isMatchLive(match.status)).sort(compareByStartTime);
    const upcoming = remaining
      .filter((match) => !isMatchLive(match.status))
      .filter((match) => {
        const startTime = toTime(match.start_time);
        return startTime === null || startTime >= staleBefore;
      })
      .sort(compareByStartTime);
    return [...live, ...upcoming].slice(0, homeLimits.upcomingMatches);
  }, [heroFeaturedMatches, homeLimits.upcomingMatches, safeOpenMatches]);

  const activeEvents = useMemo(
    () => filterEventsByStatusGroup(safeEvents, "active").slice(0, homeLimits.activeEvents),
    [homeLimits.activeEvents, safeEvents],
  );
  const upcomingEvents = useMemo(
    () => filterEventsByStatusGroup(safeEvents, "upcoming").slice(0, homeLimits.timelineEvents),
    [homeLimits.timelineEvents, safeEvents],
  );

  // One "Watch" list: streams still to come first, then the latest replays.
  const watchMatches = useMemo(() => {
    const byId = new Map();
    const hasWatchable = (match) => hasMatchMedia(match) || Boolean(match?.has_media);

    [...safeOpenMatches, ...safeLatestMatches]
      .filter((match) => match?.id && hasWatchable(match) && !isMatchFinal(match.status))
      .sort(compareByStartTime)
      .slice(0, homeLimits.streamMatches)
      .forEach((match) => byId.set(match.id, match));

    recentBroadcastMatches
      .filter((match) => match?.id && hasWatchable(match))
      .slice(0, homeLimits.streamMatches)
      .forEach((match) => {
        if (!byId.has(match.id)) byId.set(match.id, match);
      });

    return Array.from(byId.values()).slice(0, homeLimits.watch);
  }, [homeLimits.streamMatches, homeLimits.watch, recentBroadcastMatches, safeLatestMatches, safeOpenMatches]);

  const latestResults = useMemo(() => {
    return recentFinalMatches
      .map((match) => ({ match, completedTime: getMatchCompletionTime(match) }))
      .filter(
        ({ match, completedTime }) =>
          Boolean(match?.id) && isMatchFinal(match?.status) && completedTime !== null,
      )
      .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0))
      .slice(0, homeLimits.results)
      .map(({ match }) => match);
  }, [homeLimits.results, recentFinalMatches]);

  async function handleShareMatch(match) {
    if (!match) return;
    const link = buildMatchLink(match.id, { absolute: true });
    try {
      if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `Follow ${formatMatchup(match)}`,
          url: link,
        });
        setHeroActionStatus("Shared.");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        setHeroActionStatus("Link copied.");
        return;
      }
      throw new Error("Share not supported in this browser.");
    } catch (err) {
      setHeroActionStatus(err?.message || "Unable to share link.");
    }
  }

  function handleFindEvent(domEvent) {
    const target = typeof document !== "undefined" ? document.getElementById("home-events") : null;
    if (!target) return;
    domEvent.preventDefault();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  const liveSection = (
    <section className="home-section" aria-labelledby="home-live-title">
      <HomeSectionHeader
        id="home-live-title"
        title={heroIsLive ? "Live now" : "Up next"}
        live={heroIsLive}
        count={showMultiLiveHero ? heroFeaturedMatches.length : undefined}
      />
      {loading && heroFeaturedMatches.length === 0 ? (
        <HomeSkeleton rows={2} />
      ) : heroFeaturedMatches.length > 0 ? (
        <div className={showMultiLiveHero ? "home-feature-grid" : undefined}>
          {heroFeaturedMatches.map((match) => (
            <HomeFeaturedMatch
              key={match.id}
              match={match}
              liveEvent={liveEventLookup.get(match.id) || null}
              isLoggedIn={isLoggedIn}
              onShare={handleShareMatch}
            />
          ))}
        </div>
      ) : (
        <div className="home-card home-card--cta">
          <p className="home-card__cta-text">Nothing scheduled right now.</p>
          <Link to="/events" className="sc-button is-ghost home-action">
            Browse events
          </Link>
        </div>
      )}
      {heroActionStatus ? (
        <p className="home-status-message" role="status">
          {heroActionStatus}
        </p>
      ) : null}
      {error ? <HomeNotice tone="error">{error}</HomeNotice> : null}
    </section>
  );

  // Hidden while the hero is loading (it shows its own skeleton) and when
  // nothing is left beyond the featured match.
  const comingUpSection =
    !loading && comingUpMatches.length > 0 ? (
      <section className="home-section" aria-labelledby="home-coming-title">
        <HomeSectionHeader id="home-coming-title" title="Coming up" action={{ to: "/matches", label: "All matches" }} />
        <HomeAgendaList matches={comingUpMatches} />
      </section>
    ) : null;

  const yourTeamsSection = isLoggedIn ? (
    <LazyHomeSection
      onVisible={() => setRenderPersonalized(true)}
      placeholderHeight={200}
      rootMargin="220px 0px"
    >
      {renderPersonalized && (
        <section className="home-section" aria-labelledby="home-yours-title">
          <HomeSectionHeader
            id="home-yours-title"
            title="Your notifications"
            action={{ to: "/notifications", label: "Notifications" }}
          />
          {personalizedError ? <HomeNotice tone="error">{personalizedError}</HomeNotice> : null}
          {personalizedMessage ? <HomeNotice>{personalizedMessage}</HomeNotice> : null}
          {personalizedLoading && subscriptions.length === 0 ? (
            <HomeSkeleton rows={2} />
          ) : (
            <HomeYourTeams
              teams={myTeamInsights}
              matches={myMatchInsights}
              teamsLoading={myTeamsLoading}
              players={myPlayerInsights}
              playersLoading={myPlayersLoading}
              matchesLoading={myMatchesLoading}
            />
          )}
        </section>
      )}
    </LazyHomeSection>
  ) : null;

  const eventsSection = (
    <LazyHomeSection
      id="home-events"
      className="home-anchor"
      onVisible={() => setRenderEventTimeline(true)}
      placeholderHeight={320}
      rootMargin="520px 0px"
    >
      {renderEventTimeline && (
        <section className="home-section" aria-labelledby="home-events-title">
          <HomeSectionHeader
            id="home-events-title"
            title="Events"
            description="Tap an event for its schedule, standings and results."
            action={{ to: "/events", label: "All events" }}
          />
          {belowFoldError ? <HomeNotice tone="error">{belowFoldError}</HomeNotice> : null}
          {belowFoldLoading && safeEvents.length === 0 ? (
            <HomeSkeleton rows={3} />
          ) : (
            <HomeEventList activeEvents={activeEvents} upcomingEvents={upcomingEvents} />
          )}
        </section>
      )}
    </LazyHomeSection>
  );

  // Signed-out counterpart of "Your notifications", placed under Events.
  // Waits for the session check so a signed-in user never sees it flash.
  const notificationsPromoSection =
    !authLoading && !isLoggedIn ? (
      <section className="home-section" aria-labelledby="home-alerts-title">
        <HomeSectionHeader id="home-alerts-title" title="Notifications" />
        <HomeNotificationsPromo />
      </section>
    ) : null;

  const resultsSection = (
    <LazyHomeSection onVisible={() => setRenderFinals(true)} placeholderHeight={320}>
      {renderFinals && (finalsLoading || latestResults.length > 0) && (
        <section className="home-section" aria-labelledby="home-results-title">
          <HomeSectionHeader
            id="home-results-title"
            title="Latest results"
            action={{ to: "/matches", label: "All results" }}
          />
          {finalsLoading && latestResults.length === 0 ? (
            <HomeSkeleton rows={3} />
          ) : (
            <HomeResultList matches={latestResults} />
          )}
        </section>
      )}
    </LazyHomeSection>
  );

  // Often empty, so it shows nothing until there is something to watch rather
  // than flashing a skeleton that then disappears.
  const watchSection = (
    <LazyHomeSection onVisible={() => setRenderStreaming(true)} placeholderHeight={200}>
      {renderStreaming && !streamsLoading && watchMatches.length > 0 && (
        <section className="home-section" aria-labelledby="home-watch-title">
          <HomeSectionHeader id="home-watch-title" title="Watch" description="Live streams and replays." />
          <HomeWatchList matches={watchMatches} />
        </section>
      )}
    </LazyHomeSection>
  );

  return (
    <div className="home-page text-ink">
      <div className="sc-shell home-shell">
        {showWelcome ? (
          <HomeWelcome
            stats={stats}
            statsLoaded={!belowFoldLoading}
            onDismiss={() => setWelcomeDismissed(true)}
            onFindEvent={handleFindEvent}
          />
        ) : (
          <h1 className="sr-only">StallCount – ultimate frisbee scores and fixtures</h1>
        )}
        <HomeQuickLinks />
        {/* One set of sections, two arrangements: a single stack in reading
            order on phones and tablets, a fixed main + sidebar on desktop so
            nothing reshuffles as lazy sections load. */}
        {isWideHome ? (
          <div className="home-columns">
            <div className="home-column">
              {liveSection}
              {comingUpSection}
              {resultsSection}
            </div>
            <aside className="home-column" aria-label="Events and your teams">
              {yourTeamsSection}
              {eventsSection}
              {notificationsPromoSection}
              {watchSection}
            </aside>
          </div>
        ) : (
          <div className="home-column">
            {liveSection}
            {yourTeamsSection}
            {comingUpSection}
            {eventsSection}
            {notificationsPromoSection}
            {resultsSection}
            {watchSection}
          </div>
        )}
      </div>
    </div>
  );
}

function toSettled(promise) {
  return promise
    .then((value) => ({ status: "fulfilled", value }))
    .catch((reason) => ({ status: "rejected", reason }));
}

function normalizeTargetType(type) {
  return (type || "").toString().trim().toLowerCase();
}

function isFinishedMatch(match) {
  return FINISHED_STATUSES.has((match?.status || "").toString().toLowerCase());
}

// Only finished matches count: an unplayed fixture sits at 0-0 and a live
// one's score is not yet a result.
function computeTeamRecord(matches, teamId) {
  if (!Array.isArray(matches)) return null;
  return matches.filter(isFinishedMatch).reduce(
    (acc, match) => {
      const isTeamA = match.team_a?.id === teamId;
      const isTeamB = match.team_b?.id === teamId;
      if (!isTeamA && !isTeamB) {
        return acc;
      }
      const scoreFor = isTeamA ? match.score_a ?? 0 : match.score_b ?? 0;
      const scoreAgainst = isTeamA ? match.score_b ?? 0 : match.score_a ?? 0;
      if (scoreFor > scoreAgainst) {
        acc.wins += 1;
      } else if (scoreAgainst > scoreFor) {
        acc.losses += 1;
      }
      acc.pointsFor += scoreFor;
      acc.pointsAgainst += scoreAgainst;
      return acc;
    },
    { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
  );
}

function computePlayerInsight(playerId, playerRow, statRows) {
  const totals = statRows.reduce(
    (acc, row) => ({
      goals: acc.goals + (row.goals ?? 0),
      assists: acc.assists + (row.assists ?? 0),
      matches: acc.matches + 1,
    }),
    { goals: 0, assists: 0, matches: 0 },
  );
  // The service orders by match id, not date, so find the latest game here.
  const latest =
    [...statRows].sort((a, b) => (toTime(b.match?.start_time) ?? 0) - (toTime(a.match?.start_time) ?? 0))[0] || null;
  return {
    playerId,
    name: playerRow?.name || latest?.player?.name || "Player",
    jerseyNumber: playerRow?.jersey_number ?? latest?.player?.jersey_number ?? null,
    teamName: latest?.team?.name || null,
    totals,
  };
}

function pickNextFixture(matches, teamId) {
  if (!Array.isArray(matches)) return null;
  const now = Date.now();
  const future = matches
    .filter((match) => {
      const time = toTime(match.start_time);
      return time !== null && time >= now && !isFinishedMatch(match);
    })
    .sort(compareByStartTime);
  const target = future[0];
  if (!target) return null;
  const opponent = target.team_a?.id === teamId ? target.team_b : target.team_a;
  return {
    matchId: target.id,
    opponentName: opponent?.name || "TBC",
    startTime: target.start_time,
    venueName: target.venue?.name || null,
  };
}

function pickLastResult(matches, teamId) {
  if (!Array.isArray(matches)) return null;
  const past = matches
    .filter((match) => match.start_time && isFinishedMatch(match))
    .sort((a, b) => compareByStartTime(b, a));
  const target = past[0];
  if (!target) return null;
  const isTeamA = target.team_a?.id === teamId;
  const isTeamB = target.team_b?.id === teamId;
  if (!isTeamA && !isTeamB) return null;
  const opponent = isTeamA ? target.team_b : target.team_a;
  const scoreFor = isTeamA ? target.score_a ?? 0 : target.score_b ?? 0;
  const scoreAgainst = isTeamA ? target.score_b ?? 0 : target.score_a ?? 0;
  return {
    opponentName: opponent?.name || "Opponent",
    scoreFor,
    scoreAgainst,
  };
}

// UI buckets for the event list. The KEYS (active/past/upcoming) are
// display groupings, not database values; the VALUES are canonical
// match_status codes, since events.Status is a FK to that table.
//
// `postponed` groups with upcoming: it has no date yet but is still expected.
const EVENT_STATUS_GROUPS = {
  active: new Set(IN_PROGRESS_STATUSES),
  past: new Set(CLOSED_STATUSES),
  upcoming: new Set(PENDING_STATUSES.map((code) => code.toLowerCase())),
};

/**
 * True when a match belongs to an event that is over — played out, canceled,
 * or forfeited.
 *
 * Deliberately exclusion-based rather than allowlist-based: only a *known*
 * closed status hides a match. An event with a missing, null, or unrecognised
 * status still shows, because wrongly hiding a live match is far worse than
 * showing a stale one. Matches with no event attached are always kept.
 *
 * The query in getOpenMatches already excludes these in SQL; this is the
 * client-side backstop for data arriving by any other path.
 */
function isMatchFromClosedEvent(match) {
  return isClosedStatus(match?.event?.status);
}

function filterEventsByStatusGroup(events = [], group) {
  const allowedStatuses = EVENT_STATUS_GROUPS[group] || new Set();
  const sortDescending = group === "active" || group === "past";

  return events
    .filter((event) => {
      const status = (event?.status || "").toString().trim().toLowerCase();
      return allowedStatuses.has(status);
    })
    .sort((a, b) => {
      const aTime = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      return sortDescending ? bTime - aTime : aTime - bTime;
    });
}

function getMatchCompletionTime(match) {
  if (!match) return null;
  return toTime(match.confirmed_at || match.start_time);
}
