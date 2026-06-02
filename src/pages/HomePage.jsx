import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getTeamsByIds, getTeamMatches } from "../services/teamService";
import {
  getMatchesByIds,
} from "../services/matchService";
import { getSubscriptions } from "../services/subscriptionService";
import { getCurrentUser } from "../services/userService";
import { useAuth } from "../context/AuthContext";
import {
  getHomeBelowFoldSummary,
  getHomeFinalsSummary,
  getHomeHeroSummary,
  getHomeStreamingSummary,
} from "../services/homeSummaryService";
import { getEventWorkspacePath } from "./eventWorkspaces";
import { Card, Metric, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
import { StandardEventMatchCard } from "../components/StandardEventMatchCard";
import {
  hasMatchMedia,
} from "../utils/matchMedia";

const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const MAX_MY_TEAMS = 2;
const MAX_MY_MATCHES = 3;
const DESKTOP_HOME_LIMITS = {
  teams: 8,
  events: 40,
  recentMatches: 50,
  openMatches: 20,
  broadcastMatches: 5,
  finalMatches: 16,
  liveEvents: 50,
  activeEvents: 5,
  timelineEvents: 8,
  streamMatches: 5,
  upcomingMatches: 10,
};
const MOBILE_HOME_LIMITS = {
  teams: 6,
  events: 12,
  recentMatches: 12,
  openMatches: 8,
  broadcastMatches: 3,
  finalMatches: 8,
  liveEvents: 10,
  activeEvents: 5,
  timelineEvents: 4,
  streamMatches: 3,
  upcomingMatches: 6,
};
const HOME_LAZY_SECTION_ROOT_MARGIN = "700px 0px";
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined);
const MATCH_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const HEADING_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function LazyHomeSection({
  children,
  className = "",
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

  return (
    <div ref={ref} className={`home-lazy-section ${className}`}>
      {isVisible ? children : <div aria-hidden="true" style={{ minHeight: placeholderHeight }} />}
    </div>
  );
}

export default function HomePage() {
  const [featuredTeams, setFeaturedTeams] = useState([]);
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

  const [profile, setProfile] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [personalizedLoading, setPersonalizedLoading] = useState(false);
  const [personalizedError, setPersonalizedError] = useState(null);
  const [personalizedMessage, setPersonalizedMessage] = useState(null);
  const [myTeamInsights, setMyTeamInsights] = useState([]);
  const [myMatchInsights, setMyMatchInsights] = useState([]);
  const [myTeamsLoading, setMyTeamsLoading] = useState(false);
  const [myMatchesLoading, setMyMatchesLoading] = useState(false);

  const [renderStreaming, setRenderStreaming] = useState(false);
  const [renderMatches, setRenderMatches] = useState(false);
  const [renderFinals, setRenderFinals] = useState(false);
  const [renderEventTimeline, setRenderEventTimeline] = useState(false);
  const [renderPersonalized, setRenderPersonalized] = useState(false);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [finalsLoading, setFinalsLoading] = useState(false);
  const [isCompactHome, setIsCompactHome] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false,
  );

  const { session } = useAuth();
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

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(max-width: 640px)");
    const handleChange = (event) => setIsCompactHome(event.matches);
    setIsCompactHome(query.matches);

    if (query.addEventListener) {
      query.addEventListener("change", handleChange);
      return () => query.removeEventListener("change", handleChange);
    }

    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);
  useEffect(() => {
    let ignore = false;

    async function loadHeroData() {
      setLoading(true);
      setError(null);
      try {
        const summary = await getHomeHeroSummary({
          limits: {
            openMatches: homeLimits.openMatches,
            liveEvents: homeLimits.liveEvents,
          },
        });

        if (ignore) return;

        setOpenMatches(summary.openMatches);
        setLiveEvents(summary.liveEvents);

        if (summary.failures.length > 0) {
          summary.failures.forEach((failure) => {
            console.error(`[HomePage] ${failure.message}`);
          });
          const criticalFailures = summary.failures
            .map((failure) => failure.key)
            .filter((key) => key !== "live events");
          if (criticalFailures.length > 0) {
            setError(`Unable to load ${criticalFailures.join(", ")}. Please refresh and try again.`);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("[HomePage] Unexpected load error:", err);
          setError(err?.message || "Unable to load league data.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadHeroData();

    return () => {
      ignore = true;
    };
  }, [homeLimits.liveEvents, homeLimits.openMatches]);

  useEffect(() => {
    if (!renderEventTimeline) return undefined;

    let ignore = false;

    async function loadBelowFoldData() {
      setBelowFoldLoading(true);
      setBelowFoldError(null);
      try {
        const summary = await getHomeBelowFoldSummary({
          limits: {
            teams: homeLimits.teams,
            events: homeLimits.events,
          },
        });

        if (ignore) return;

        setFeaturedTeams(summary.teams);
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
  }, [homeLimits.events, homeLimits.teams, renderEventTimeline]);

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
      setProfile(null);
      setSubscriptions([]);
      setMyTeamInsights([]);
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

    Promise.all([toSettled(getCurrentUser()), toSettled(getSubscriptions(profileId))])
      .then(([profileResult, subscriptionsResult]) => {
        if (ignore) return;

        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
        } else {
          setProfile(null);
          console.error("[HomePage] Failed to load profile:", profileResult.reason);
        }

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
  const safeOpenMatches = useMemo(() => openMatches ?? [], [openMatches]);
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
    return [...safeOpenMatches]
      .filter((match) => isMatchLive(match?.status))
      .sort((a, b) => {
        const aTime = a?.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b?.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }, [safeOpenMatches]);

  const liveNowMatch = liveHeroMatches[0] || null;

  const nextMatchCandidate = useMemo(() => {
    const now = Date.now();
    const futureSorted = [...safeOpenMatches]
      .filter((match) => !FINISHED_STATUSES.has((match?.status || "").toLowerCase()))
      .filter((match) => {
        if (!match?.start_time) return true;
        const startTime = new Date(match.start_time).getTime();
        return Number.isNaN(startTime) ? true : startTime > now;
      })
      .sort((a, b) => {
        const aTime = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    if (liveNowMatch) {
      return futureSorted.find((match) => match.id !== liveNowMatch.id) || null;
    }
    return futureSorted[0] || null;
  }, [safeOpenMatches, liveNowMatch]);

  const heroCardMatch = liveNowMatch || nextMatchCandidate || null;
  const heroCardIsLive = Boolean(liveNowMatch);
  const showMultiLiveHero = liveHeroMatches.length > 1;
  const heroFeaturedMatches = useMemo(
    () =>
      showMultiLiveHero
        ? liveHeroMatches
        : heroCardMatch
          ? [heroCardMatch]
          : [],
    [showMultiLiveHero, liveHeroMatches, heroCardMatch],
  );
  const heroFeaturedMatchIds = useMemo(
    () => heroFeaturedMatches.map((match) => match?.id).filter(Boolean),
    [heroFeaturedMatches],
  );

  const nextScheduledMatch = useMemo(() => {
    const now = Date.now();
    const futureSorted = [...safeOpenMatches]
      .filter((match) => !FINISHED_STATUSES.has((match?.status || "").toLowerCase()))
      .filter((match) => {
        if (!match?.start_time) return true;
        const startTime = new Date(match.start_time).getTime();
        return Number.isNaN(startTime) ? true : startTime > now;
      })
      .sort((a, b) => {
        const aTime = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    if (futureSorted.length === 0) return null;
    if (heroCardIsLive) {
      return futureSorted[0] || null;
    }
    if (heroCardMatch?.id) {
      const index = futureSorted.findIndex((match) => match.id === heroCardMatch.id);
      if (index >= 0) {
        return futureSorted[index + 1] || null;
      }
    }
    return futureSorted[0] || null;
  }, [safeOpenMatches, heroCardIsLive, heroCardMatch]);

  const isLoggedIn = Boolean(session?.user);

  const activeTimelineEvents = useMemo(
    () => filterEventsByStatusGroup(safeEvents, "active"),
    [safeEvents],
  );
  const pastTimelineEvents = useMemo(
    () => filterEventsByStatusGroup(safeEvents, "past"),
    [safeEvents],
  );
  const upcomingTimelineEvents = useMemo(
    () => filterEventsByStatusGroup(safeEvents, "upcoming"),
    [safeEvents],
  );
  const homepageEventSections = useMemo(
    () => [
      {
        key: "active",
        title: "Current events",
        events: activeTimelineEvents,
        limit: homeLimits.activeEvents,
        emptyMessage: "No current events right now.",
      },
      {
        key: "past",
        title: "Past events",
        events: pastTimelineEvents,
        limit: homeLimits.timelineEvents,
        emptyMessage: "No past events on the calendar.",
      },
      {
        key: "upcoming",
        title: "Upcoming events",
        events: upcomingTimelineEvents,
        limit: homeLimits.timelineEvents,
        emptyMessage: "No upcoming events on the calendar.",
      },
    ],
    [activeTimelineEvents, homeLimits.activeEvents, homeLimits.timelineEvents, pastTimelineEvents, upcomingTimelineEvents],
  );

  const streamMatches = useMemo(() => {
    const map = new Map();
    [...safeOpenMatches, ...safeLatestMatches].forEach((match) => {
      if (match?.id && !map.has(match.id)) {
        map.set(match.id, match);
      }
    });
    return Array.from(map.values()).filter((match) => matchHasStream(match) || Boolean(match?.has_media));
  }, [safeOpenMatches, safeLatestMatches]);

  const upcomingStreamMatches = useMemo(() => {
    return streamMatches
      .filter((match) => !isMatchFinal(match?.status))
      .sort((a, b) => {
        const aTime = a?.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b?.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, homeLimits.streamMatches);
  }, [homeLimits.streamMatches, streamMatches]);

  const recentStreamMatches = useMemo(() => {
    return recentBroadcastMatches
      .filter((match) => matchHasStream(match) || Boolean(match?.has_media))
      .slice(0, homeLimits.streamMatches);
  }, [homeLimits.streamMatches, recentBroadcastMatches]);

  const forYouLoading = personalizedLoading || myTeamsLoading || myMatchesLoading;
  const liveAndUpcomingMatches = useMemo(() => {
    const filtered = safeOpenMatches.filter((match) => !heroFeaturedMatchIds.includes(match?.id));
    const sortByStartTime = (list) =>
      list.sort((a, b) => {
        const aTime = a?.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b?.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    const liveMatches = sortByStartTime(filtered.filter((match) => isMatchLive(match.status)));
    const upcomingMatches = sortByStartTime(filtered.filter((match) => !isMatchLive(match.status)));
    return [...liveMatches, ...upcomingMatches].slice(0, homeLimits.upcomingMatches);
  }, [homeLimits.upcomingMatches, safeOpenMatches, heroFeaturedMatchIds]);
  const latestResults = useMemo(() => {
    return recentFinalMatches
      .map((match) => ({ match, completedTime: getMatchCompletionTime(match) }))
      .filter(
        ({ match, completedTime }) =>
          Boolean(match?.id) && isMatchFinal(match?.status) && completedTime !== null,
      )
      .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0))
      .slice(0, homeLimits.finalMatches)
      .map(({ match }) => match);
  }, [homeLimits.finalMatches, recentFinalMatches]);

  const heroStats = [
    { label: "teams", value: stats.teams },
    { label: "players", value: stats.players },
    { label: "events", value: stats.events },
  ];

  const myNextMatchAnswer = nextScheduledMatch
    ? `${formatMatchup(nextScheduledMatch)}`
    : "Add your fixtures";

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

  const renderHeroMatchCard = (match, options = {}) => {
    const { compact = false } = options;
    if (!match) return null;

    const live = isMatchLive(match.status);
    const liveEvent = live ? liveEventLookup.get(match.id) || null : null;
    const pointStatus = live ? derivePointStatus(liveEvent) : null;
    const liveClockLabel = live ? deriveClockLabel(match, liveEvent) : null;
    const lastEvent = live ? formatLiveEventSummary(liveEvent, match) : null;
    const trackerHref = buildMatchLink(match.id);
    const notificationHref = `/notifications?targetType=match&targetId=${match.id}`;
    const liveMetaParts = live
      ? [liveClockLabel || "Waiting for next score update", lastEvent ? `Last event: ${lastEvent}` : "No logs yet"]
      : [];

    return (
      <StandardEventMatchCard
        key={match.id}
        match={match}
        variant="muted"
        className={`sc-frosted sc-live-card home-hero-match ${compact ? "p-3 sm:p-4" : "p-3 sm:p-5"} ${
          live ? "is-live border-2 border-live-border bg-live-bg" : ""
        }`}
        eyebrow={pointStatus && live ? `${pointStatus} point` : live ? "Live now" : "Next up"}
        title={formatMatchup(match)}
        meta={liveMetaParts.join(" | ")}
        score={live ? formatLiveScore(match) : null}
        status={live ? "Live" : formatMatchStatus(match.status) || "Scheduled"}
        actions={
          <>
            <Link to={live ? trackerHref : notificationHref} className="sc-button text-center">
              {live ? "Open live tracker" : "Notifications"}
            </Link>
            <button type="button" onClick={() => void handleShareMatch(match)} className="sc-button is-ghost">
              Share
            </button>
          </>
        }
        linkCard={false}
        hideEyebrow={false}
        compact={compact}
        hideFinishedVenue={false}
        hideVenue
      />
    );
  };

  return (
    <div className="home-page pb-10 text-ink sm:pb-20">
      <SectionShell as="header" className="space-y-3 pb-1 pt-2 sm:space-y-6 sm:pt-8 sm:pb-2">
        <Card className="sc-hero home-hero-board p-3 sm:p-8 lg:p-10">
          <div className="space-y-4 sm:space-y-8">
            <div className={showMultiLiveHero ? "space-y-3 sm:space-y-6" : "home-hero-grid"}>
              <div className="home-hero-panel space-y-3 sm:space-y-6">
                <div className="sc-metric-row home-hero-metrics">
                  {heroStats.map((item) => (
                    <Metric
                      key={item.label}
                      className="sc-metric--stacked"
                      value={belowFoldLoading ? "--" : item.value}
                      label={item.label}
                    />
                  ))}
                </div>
                {heroActionStatus && (
                  <p className="text-xs font-semibold text-accent">{heroActionStatus}</p>
                )}
              </div>
              {!showMultiLiveHero && (
                <div className="space-y-3 sm:space-y-4">
                  {heroCardMatch ? (
                    renderHeroMatchCard(heroCardMatch)
                  ) : (
                    <div className="home-empty-state text-left">
                      <p className="text-2xl font-semibold text-ink">No matches scheduled</p>
                    </div>
                  )}
                  <Panel variant="tinted" className="home-next-strip p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      <span>Next scheduled</span>
                      {nextScheduledMatch?.start_time && (
                        <span>{formatHeadingDateTime(nextScheduledMatch.start_time)}</span>
                      )}
                    </div>
                    <p className="text-sm text-ink">{myNextMatchAnswer}</p>
                  </Panel>
                  {error && (
                    <p className="rounded-2xl border border-rose-400/30 bg-rose-950/50 p-3 text-sm font-semibold text-rose-100 sm:p-4">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
            {showMultiLiveHero && (
              <div className="space-y-3 sm:space-y-4">
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {liveHeroMatches.map((match) => renderHeroMatchCard(match, { compact: true }))}
                </div>
                <Panel variant="tinted" className="home-next-strip p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <span>Next scheduled</span>
                    {nextScheduledMatch?.start_time && (
                      <span>{formatHeadingDateTime(nextScheduledMatch.start_time)}</span>
                    )}
                  </div>
                  <p className="text-sm text-ink">{myNextMatchAnswer}</p>
                </Panel>
                {error && (
                  <p className="rounded-2xl border border-rose-400/30 bg-rose-950/50 p-3 text-sm font-semibold text-rose-100 sm:p-4">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      </SectionShell>
      {isLoggedIn && (
        <LazyHomeSection
          onVisible={() => setRenderPersonalized(true)}
          placeholderHeight={420}
          rootMargin="220px 0px"
        >
          {renderPersonalized && (
        <SectionShell as="section" className="home-lazy-section__content home-section space-y-3 sm:space-y-5">
            <SectionHeader
              title="Your notifications"
              action={
                <>
                  <Link to="/notifications" className="sc-button text-xs">
                    Notifications
                  </Link>
                  {forYouLoading && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Refreshing...</span>
                  )}
                </>
              }
            >
            </SectionHeader>
            {personalizedError && (
              <p
                className="rounded-xl border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-100 sm:p-4"
              >
                {personalizedError}
              </p>
            )}
            {personalizedMessage && (
              <p className="rounded-xl border border-border/70 bg-[rgba(6,22,18,0.45)] p-3 text-sm text-ink sm:p-4">
                {personalizedMessage}
              </p>
            )}
            <div className="home-dashboard-grid">
              <div className="home-dashboard-column">
                <div className="home-dashboard-column__title">
                  <h3 className="text-lg font-semibold text-ink">Teams</h3>
                </div>
                <div>
                  {myTeamsLoading ? (
                    <p className="text-sm text-ink-muted">Loading teams...</p>
                  ) : myTeamInsights.length === 0 ? (
                    <p className="text-sm text-ink-muted">Follow a team to see records and fixtures here.</p>
                  ) : (
                    <div className="home-mini-list">
                      {myTeamInsights.map((team) => (
                        <div key={team.teamId} className="home-mini-row">
                          <p className="text-sm font-semibold text-ink">{team.name}</p>
                          <div className="mt-1 space-y-1 text-xs text-ink-muted">
                            {team.record && <p>Record {formatRecord(team.record)}</p>}
                            {team.nextFixture && <p>Next: {formatFixture(team.nextFixture)}</p>}
                            {team.lastResult && <p>Last: {formatResult(team.lastResult)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="home-dashboard-column">
                <div className="home-dashboard-column__title">
                  <h3 className="text-lg font-semibold text-ink">Matches</h3>
                </div>
                <div>
                  {myMatchesLoading ? (
                    <p className="text-sm text-ink-muted">Loading matches...</p>
                  ) : myMatchInsights.length === 0 ? (
                    <p className="text-sm text-ink-muted">Follow matches to keep them pinned here.</p>
                  ) : (
                    <div className="space-y-2">
                      {myMatchInsights.map((match) => (
                        <StandardEventMatchCard
                          key={match.id}
                          match={match}
                          eyebrow={match.event?.name || "Match"}
                          title={formatMatchup(match)}
                          meta={null}
                          score={isMatchLive(match.status) || isMatchFinal(match.status) ? formatLiveScore(match) : null}
                          status={formatMatchStatus(match.status) || "Scheduled"}
                          hideEyebrow={false}
                          compact
                          hideFinishedVenue={false}
                          hideVenue
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
        </SectionShell>
          )}
        </LazyHomeSection>
      )}

      <main className="space-y-0">
        <LazyHomeSection onVisible={() => setRenderEventTimeline(true)} placeholderHeight={520} rootMargin="520px 0px">
          {renderEventTimeline && (
          <SectionShell as="section" className="home-lazy-section__content home-section home-timeline">
              {belowFoldError && (
                <p
                  className="rounded-xl border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-100 sm:p-4"
                >
                  {belowFoldError}
                </p>
              )}
              {homepageEventSections.map((section) => (
                <div
                  key={section.key}
                  className="home-timeline-section"
                >
                  <SectionHeader title={section.title} />
                  {belowFoldLoading && safeEvents.length === 0 ? (
                    <div className="home-empty-state">
                      Loading events...
                    </div>
                  ) : section.events.length === 0 ? (
                    <div className="home-empty-state">
                      {section.emptyMessage}
                    </div>
                  ) : (
                    <div className="home-timeline-list home-timeline-list--grid">
                      {section.events.slice(0, section.limit).map((event) => (
                        <HomeEventCard key={event.id} event={event} eventStatusTab={section.key} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </SectionShell>
          )}
        </LazyHomeSection>

        <LazyHomeSection onVisible={() => setRenderStreaming(true)} placeholderHeight={520}>
          {renderStreaming && (
          <SectionShell as="section" className="home-lazy-section__content home-section space-y-3 sm:space-y-5">
            <SectionHeader
              eyebrowVariant="media"
              title="Featured broadcasts"
            />
            <div className="home-media-grid">
              <div className="home-media-column space-y-3 sm:space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-ink">Next to stream</h3>
                </div>
                {streamsLoading && upcomingStreamMatches.length === 0 ? (
                  <p className="text-sm text-ink-muted">Loading streams...</p>
                ) : upcomingStreamMatches.length > 0 ? (
                  <div className="space-y-2 sm:space-y-3">
                    {upcomingStreamMatches.map((match) => (
                      <HomeStreamMatchCard key={match.id} match={match} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">No upcoming matches with media linked.</p>
                )}
              </div>

              <div className="home-media-column space-y-3 sm:space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-ink">Latest replays</h3>
                </div>
                {streamsLoading && recentStreamMatches.length === 0 ? (
                  <p className="text-sm text-ink-muted">Loading replays...</p>
                ) : recentStreamMatches.length > 0 ? (
                  <div className="space-y-2 sm:space-y-3">
                    {recentStreamMatches.map((match) => (
                      <HomeStreamMatchCard key={match.id} match={match} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">No recent matches with media linked.</p>
                )}
              </div>
            </div>
          </SectionShell>
          )}
        </LazyHomeSection>

        <LazyHomeSection onVisible={() => setRenderFinals(true)} placeholderHeight={420}>
          {renderFinals && (
          <SectionShell as="section" className="home-lazy-section__content home-section space-y-3 sm:space-y-4">
              <SectionHeader
                title="Latest results"
              />
              {finalsLoading && latestResults.length === 0 ? (
                <div className="home-empty-state">
                  Loading results...
                </div>
              ) : latestResults.length === 0 ? (
                <div className="home-empty-state">
                  No finals saved yet.
                </div>
              ) : (
                <div className="home-score-grid">
                  {latestResults.map((match) => (
                    <StandardEventMatchCard
                      key={match.id}
                      match={match}
                      className="home-score-card"
                      eyebrow={match.event?.name || "Match"}
                      title={formatMatchup(match)}
                      meta={null}
                      score={formatLiveScore(match)}
                      status={formatMatchStatus(match.status) || "Final"}
                      hideEyebrow={false}
                      compact={false}
                      scoreAlign="right"
                      hideVenue
                    />
                  ))}
                </div>
              )}
          </SectionShell>
          )}
        </LazyHomeSection>

        <LazyHomeSection onVisible={() => setRenderMatches(true)} placeholderHeight={440}>
          {renderMatches && (
          <SectionShell as="section" className="home-lazy-section__content home-section space-y-3 sm:space-y-4">
              <SectionHeader
                eyebrow="Live"
                eyebrowVariant="live"
                title="Live & upcoming"
              />
              {loading && liveAndUpcomingMatches.length === 0 ? (
                <div className="home-empty-state">
                  Loading matches...
                </div>
              ) : liveAndUpcomingMatches.length === 0 ? (
                <div className="home-empty-state">
                  No open matches right now.
                </div>
              ) : (
                <div className="home-agenda-grid">
                  {liveAndUpcomingMatches.map((match) => {
                    const live = isMatchLive(match.status);
                    const final = isMatchFinal(match.status);
                    const showScore = live || final;
                    const statusLabel = showScore
                      ? formatMatchStatus(match.status) || (live ? "Live" : "Final")
                      : formatMatchStatus(match.status) || "Scheduled";
                    return (
                      <StandardEventMatchCard
                        key={match.id}
                        match={match}
                        variant="tintedAlt"
                        className="home-agenda-card"
                        eyebrow={match.event?.name || "Match"}
                        title={formatMatchup(match)}
                        meta={null}
                        score={showScore ? formatLiveScore(match) : null}
                        status={statusLabel}
                        hideEyebrow={false}
                        compact={false}
                        hideFinishedVenue={false}
                        hideVenue
                      />
                    );
                  })}
                </div>
              )}
          </SectionShell>
          )}
        </LazyHomeSection>

      </main>
    </div>
  );
}

const HomeEventCard = memo(function HomeEventCard({ event, eventStatusTab }) {
  const eventWorkspacePath = getEventWorkspacePath(event.id);
  const searchParams = new URLSearchParams({ eventId: event.id });
  if (eventStatusTab) {
    searchParams.set("status", eventStatusTab);
  }
  const fallbackPath = `/events?${searchParams.toString()}`;
  const cardClassName =
    eventStatusTab === "active"
      ? "home-event-row is-active block border-white/90 p-3 transition hover:border-white hover:text-ink sm:p-3"
      : "home-event-row block p-3 transition hover:border-accent/70 hover:text-ink sm:p-3";

  return (
    <Card
      as={Link}
      to={eventWorkspacePath || fallbackPath}
      variant="muted"
      className={cardClassName}
    >
      <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold leading-snug text-ink">{event.name}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="home-event-row__date text-left">
            {formatDateRange(event.start_date, event.end_date)}
          </p>
        </div>
      </div>
    </Card>
  );
});

const HomeStreamMatchCard = memo(function HomeStreamMatchCard({ match }) {
  return (
    <StandardEventMatchCard
      match={match}
      eyebrow={match.event?.name || "Stream"}
      title={formatMatchup(match)}
      meta={null}
      score={isMatchLive(match.status) || isMatchFinal(match.status) ? formatLiveScore(match) : null}
      status={formatMatchStatus(match.status) || "Scheduled"}
      hideEyebrow={false}
      compact
      hideFinishedVenue={false}
      hideVenue
    />
  );
});

function formatDateRange(start, end) {
  if (!start && !end) return "Dates pending";
  const startDate = start ? formatDateValue(start, DATE_FORMATTER, "TBD") : "TBD";
  const endDate = end ? formatDateValue(end, DATE_FORMATTER, null) : null;
  return endDate && endDate !== startDate ? `${startDate} - ${endDate}` : startDate;
}

function formatDateValue(value, formatter, fallback = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return formatter.format(date);
}

function toSettled(promise) {
  return promise
    .then((value) => ({ status: "fulfilled", value }))
    .catch((reason) => ({ status: "rejected", reason }));
}

function formatMatchTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Start time pending";
  return `${DATE_FORMATTER.format(date)} at ${MATCH_TIME_FORMATTER.format(date)}`;
}

function formatHeadingDateTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Start time pending";
  const time = MATCH_TIME_FORMATTER.format(date);
  const day = HEADING_DATE_FORMATTER.format(date);
  return `${time}, ${day}`;
}

function formatMatchup(match) {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}

function matchHasStream(match) {
  return hasMatchMedia(match);
}

function formatLiveScore(match) {
  const left = typeof match.score_a === "number" ? match.score_a : "-";
  const right = typeof match.score_b === "number" ? match.score_b : "-";
  return `${left} - ${right}`;
}

function formatMatchStatus(status) {
  if (!status) return "";
  const normalized = status.toString().trim().toLowerCase();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildMatchLink(matchId, options = {}) {
  const path = matchId ? `/matches?matchId=${matchId}` : "/matches";
  if (options.absolute && typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}

function normalizeTargetType(type) {
  return (type || "").toString().trim().toLowerCase();
}
function computeTeamRecord(matches, teamId) {
  if (!Array.isArray(matches)) return null;
  return matches.reduce(
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

function pickNextFixture(matches, teamId) {
  if (!Array.isArray(matches)) return null;
  const now = Date.now();
  const future = matches
    .filter((match) => {
      if (!match.start_time) return false;
      const time = new Date(match.start_time).getTime();
      const status = (match.status || "").toLowerCase();
      return time >= now && !FINISHED_STATUSES.has(status);
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const target = future[0];
  if (!target) return null;
  const opponent = target.team_a?.id === teamId ? target.team_b : target.team_a;
  return {
    matchId: target.id,
    opponentName: opponent?.name || "TBD",
    startTime: target.start_time,
    venueName: target.venue?.name || null,
  };
}

function pickLastResult(matches, teamId) {
  if (!Array.isArray(matches)) return null;
  const past = matches
    .filter((match) => match.start_time)
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
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

function formatRecord(record) {
  if (!record) return "0-0";
  return `${record.wins}-${record.losses}`;
}

function formatFixture(fixture) {
  if (!fixture) return "TBD";
  const time = fixture.startTime ? formatMatchTime(fixture.startTime) : "TBD";
  const venue = fixture.venueName ? ` @ ${fixture.venueName}` : "";
  return `${fixture.opponentName || "Opponent"} - ${time}${venue}`;
}

function formatResult(result) {
  if (!result) return "--";
  return `${result.scoreFor}-${result.scoreAgainst} vs ${result.opponentName || "Opponent"}`;
}
function deriveClockLabel(match, liveEvent) {
  if (!match || !liveEvent) return null;
  const data = liveEvent.data || {};
  const clock = data.clock || data.timer || data.display_clock || data.game_clock;
  const cap = data.cap || data.cap_status || data.clock_label;
  if (clock && cap) {
    return `${clock} - ${cap}`;
  }
  if (clock) {
    return clock;
  }
  if (cap) {
    return cap;
  }
  return null;
}

function derivePointStatus(liveEvent) {
  if (!liveEvent) return null;
  const data = liveEvent.data || {};
  const value =
    data.point_status || data.pointStatus || data.possession || data.possession_team || data.possessionTeam || null;
  if (!value) return null;
  const normalized = value.toString().trim().toUpperCase();
  if (normalized.startsWith("O")) return "O";
  if (normalized.startsWith("D")) return "D";
  return normalized.charAt(0);
}

function formatLiveEventSummary(liveEvent, match) {
  if (!liveEvent) return null;
  const data = liveEvent.data || {};
  if (data.title) return data.title;
  if (data.description) return data.description;
  const teamId = data.team_id || data.teamId;
  const teamName = teamId
    ? match?.team_a?.id === teamId
      ? match.team_a?.name
      : match?.team_b?.id === teamId
        ? match.team_b?.name
        : null
    : null;
  return teamName ? `${teamName} ${liveEvent.event_type || "event"}` : liveEvent.event_type || "Live event";
}

const EVENT_STATUS_GROUPS = {
  active: new Set(["active", "current", "live"]),
  past: new Set(["completed", "finished", "past"]),
  upcoming: new Set(["scheduled", "upcoming"]),
};

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
  const timestamp = match.confirmed_at || match.start_time;
  if (!timestamp) return null;
  const ms = new Date(timestamp).getTime();
  return Number.isNaN(ms) ? null : ms;
}
function isMatchLive(status) {
  return LIVE_STATUSES.has((status || "").toLowerCase());
}

function isMatchFinal(status) {
  return FINISHED_STATUSES.has((status || "").toLowerCase());
}
