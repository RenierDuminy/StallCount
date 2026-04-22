import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams, getTeamsByIds, getTeamMatches } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { getTableCount } from "../services/statsService";
import {
  getRecentMatches,
  getOpenMatches,
  getMatchesByIds,
  getRecentFinalMatches,
  getRecentMatchesWithMedia,
} from "../services/matchService";
import { getRecentLiveEvents } from "../services/liveEventService";
import { getSubscriptions } from "../services/subscriptionService";
import { getCurrentUser } from "../services/userService";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getPlayersByIds } from "../services/playerService";
import { Card, Metric, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
import { StandardEventMatchCard } from "../components/StandardEventMatchCard";
import {
  getMatchMediaDetails,
  getMatchMediaProviderLabel,
  hasMatchMedia,
} from "../utils/matchMedia";

const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const MAX_MY_TEAMS = 2;
const MAX_MY_MATCHES = 3;
const MAX_SUBSCRIPTIONS_PREVIEW = 4;
const DESKTOP_HOME_LIMITS = {
  teams: 8,
  events: 40,
  recentMatches: 50,
  openMatches: 20,
  broadcastMatches: 5,
  finalMatches: 16,
  liveEvents: 50,
  activeEvents: 6,
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
  activeEvents: 3,
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
  const [error, setError] = useState(null);
  const [heroActionStatus, setHeroActionStatus] = useState(null);

  const [profile, setProfile] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [personalizedLoading, setPersonalizedLoading] = useState(false);
  const [personalizedError, setPersonalizedError] = useState(null);
  const [personalizedMessage, setPersonalizedMessage] = useState(null);
  const [myTeamInsights, setMyTeamInsights] = useState([]);
  const [myMatchInsights, setMyMatchInsights] = useState([]);
  const [followedPlayers, setFollowedPlayers] = useState([]);
  const [myTeamsLoading, setMyTeamsLoading] = useState(false);
  const [myMatchesLoading, setMyMatchesLoading] = useState(false);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const [renderStreaming, setRenderStreaming] = useState(false);
  const [renderMatches, setRenderMatches] = useState(false);
  const [renderFinals, setRenderFinals] = useState(false);
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

    async function loadPublicData() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          toSettled(getAllTeams(homeLimits.teams)),
          toSettled(getEventsList(homeLimits.events)),
          toSettled(getOpenMatches(homeLimits.openMatches)),
          toSettled(getRecentLiveEvents(homeLimits.liveEvents)),
          toSettled(getTableCount("player")),
          toSettled(getTableCount("teams")),
          toSettled(getTableCount("events")),
        ]);

        if (ignore) return;

        const [
          teamsResult,
          eventsResult,
          openMatchesResult,
          liveEventsResult,
          playersCountResult,
          teamsCountResult,
          eventsCountResult,
        ] = results;

        const failures = [];

        if (teamsResult.status === "fulfilled") {
          setFeaturedTeams(teamsResult.value);
        } else {
          failures.push("teams");
          console.error("[HomePage] Failed to load teams:", teamsResult.reason);
        }

        if (eventsResult.status === "fulfilled") {
          setEvents(eventsResult.value);
        } else {
          failures.push("events");
          console.error("[HomePage] Failed to load events:", eventsResult.reason);
        }

        if (openMatchesResult.status === "fulfilled") {
          setOpenMatches(openMatchesResult.value);
        } else {
          failures.push("upcoming matches");
          console.error("[HomePage] Failed to load open matches:", openMatchesResult.reason);
        }

        if (liveEventsResult.status === "fulfilled") {
          setLiveEvents(liveEventsResult.value);
        } else {
          console.error("[HomePage] Failed to load live events:", liveEventsResult.reason);
        }

        setStats({
          players: playersCountResult.status === "fulfilled" ? playersCountResult.value : 0,
          teams: teamsCountResult.status === "fulfilled" ? teamsCountResult.value : 0,
          events: eventsCountResult.status === "fulfilled" ? eventsCountResult.value : 0,
        });

        if (failures.length > 0) {
          setError(`Unable to load ${failures.join(", ")}. Please refresh and try again.`);
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

    loadPublicData();

    return () => {
      ignore = true;
    };
  }, [homeLimits]);

  useEffect(() => {
    if (!renderStreaming) return undefined;

    let ignore = false;

    async function loadStreamData() {
      setStreamsLoading(true);
      try {
        const results = await Promise.all([
          toSettled(getRecentMatches(homeLimits.recentMatches)),
          toSettled(getRecentMatchesWithMedia(homeLimits.broadcastMatches)),
        ]);

        if (ignore) return;

        const [latestMatchesResult, recentBroadcastMatchesResult] = results;

        if (latestMatchesResult.status === "fulfilled") {
          setLatestMatches(latestMatchesResult.value);
        } else {
          console.error("[HomePage] Failed to load recent matches:", latestMatchesResult.reason);
        }

        if (recentBroadcastMatchesResult.status === "fulfilled") {
          setRecentBroadcastMatches(recentBroadcastMatchesResult.value);
        } else {
          console.error(
            "[HomePage] Failed to load recent matches with media:",
            recentBroadcastMatchesResult.reason,
          );
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

    getRecentFinalMatches(homeLimits.finalMatches)
      .then((rows) => {
        if (!ignore) {
          setRecentFinalMatches(rows || []);
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

  useEffect(() => {
    if (!followedPlayerIds.length) {
      setFollowedPlayers([]);
      return;
    }
    let ignore = false;
    getPlayersByIds(followedPlayerIds)
      .then((rows) => {
        if (!ignore) {
          setFollowedPlayers(rows || []);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("[HomePage] Unable to load followed players:", err);
          setFollowedPlayers([]);
        }
      });
    return () => {
      ignore = true;
    };
  }, [followedPlayerIds]);

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
  const teamLookup = useMemo(
    () =>
      buildTeamLookup({
        featuredTeams,
        matches: [...safeLatestMatches, ...safeOpenMatches, ...myMatchInsights],
        myTeams: myTeamInsights,
      }),
    [featuredTeams, safeLatestMatches, safeOpenMatches, myMatchInsights, myTeamInsights],
  );

  const matchLookup = useMemo(
    () => buildMatchLookup([...safeLatestMatches, ...safeOpenMatches, ...myMatchInsights]),
    [safeLatestMatches, safeOpenMatches, myMatchInsights],
  );

  const playerLookup = useMemo(() => {
    const map = new Map();
    (followedPlayers || []).forEach((player) => {
      if (player?.id) {
        map.set(player.id, player.name || "Player");
      }
    });
    return map;
  }, [followedPlayers]);

  const mySubscriptionsPreview = useMemo(() => {
    const seen = new Set();
    const unique = [];
    (subscriptions || []).forEach((sub) => {
      const key = `${normalizeTargetType(sub.target_type)}:${sub.target_id}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      if (unique.length < MAX_SUBSCRIPTIONS_PREVIEW) {
        unique.push(sub);
      }
    });
    return unique;
  }, [subscriptions]);

  const eventLookup = useMemo(() => {
    const map = new Map();
    safeEvents.forEach((event) => {
      if (event?.id) {
        map.set(event.id, event.name || "Event");
      }
    });
    return map;
  }, [safeEvents]);

  const mySubscriptionsDetailed = useMemo(
    () =>
      mySubscriptionsPreview.map((sub) => ({
        ...sub,
        normalizedType: normalizeTargetType(sub.target_type),
        label: describeSubscriptionTarget(sub, teamLookup, matchLookup, playerLookup, eventLookup),
        href: buildSubscriptionLink(sub),
      })),
    [mySubscriptionsPreview, teamLookup, matchLookup, playerLookup, eventLookup],
  );

  const activeTimelineEvents = useMemo(() => filterActiveEvents(safeEvents), [safeEvents]);
  const filteredTimelineEvents = useMemo(() => filterTimelineEvents(safeEvents), [safeEvents]);
  const timelineEmptyMessage = "No upcoming events on the calendar.";

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

  async function handleLogout() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      const { error: signOutErr } = await supabase.auth.signOut();
      if (signOutErr) {
        throw signOutErr;
      }
    } catch (err) {
      setSignOutError(err?.message || "Unable to log out right now.");
    } finally {
      setSigningOut(false);
    }
  }

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
    const metaParts = live
      ? [liveClockLabel || "Waiting for next score update", lastEvent ? `Last event: ${lastEvent}` : "No logs yet"]
      : [`Scheduled: ${formatHeadingDateTime(match.start_time)}`, formatVenueDetails(match)].filter(Boolean);

    return (
      <StandardEventMatchCard
        key={match.id}
        match={match}
        variant="muted"
        className={`sc-frosted sc-live-card ${compact ? "p-3 sm:p-4" : "p-3 sm:p-5"} ${
          live ? "is-live border-2 border-rose-500/70 bg-rose-500/10" : ""
        }`}
        eyebrow={pointStatus && live ? `${pointStatus} point` : live ? "Live now" : "Next up"}
        title={formatMatchup(match)}
        meta={metaParts.join(" | ")}
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
        compact={compact}
        hideFinishedVenue={false}
      />
    );
  };

  return (
    <div className="home-page pb-10 text-ink sm:pb-20">
      <SectionShell as="header" className="space-y-3 pb-1 pt-2 sm:space-y-6 sm:pt-8 sm:pb-2">
        <Card className="sc-hero p-3 sm:p-8 lg:p-10">
          <div className="space-y-4 sm:space-y-8">
            <div className={showMultiLiveHero ? "space-y-3 sm:space-y-6" : "grid gap-4 sm:gap-8 lg:grid-cols-[1.05fr,0.95fr] lg:items-start"}>
              <div className="space-y-3 sm:space-y-6">
                <div className="space-y-2 sm:space-y-4">
                  <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                    Live now, next up, and standings - at a glance
                  </h1>
                </div>
                <div className="sc-metric-row">
                  {heroStats.map((item) => (
                    <Metric key={item.label} className="sc-metric--stacked" value={loading ? "..." : item.value} label={item.label} />
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
                    <Card variant="muted" className="sc-frosted sc-live-card p-3 sm:p-5">
                      <p className="text-2xl font-semibold text-ink">No matches scheduled</p>
                      <p className="mt-2 text-sm text-ink-muted">Add matches to see them here.</p>
                    </Card>
                  )}
                  <Panel variant="tinted" className="p-3 sm:p-4">
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
                <Panel variant="tinted" className="p-3 sm:p-4">
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
        <SectionShell as="section" className="home-lazy-section__content">
          <Card className="space-y-3 p-3 sm:space-y-5 sm:p-6">
            <SectionHeader
              title="My teams, matches, alerts"
              description="All your followed teams, matches, and subscriptions in one place."
              divider
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
              {profile?.full_name && <p className="text-xs text-ink-muted">Signed in as {profile.full_name}</p>}
            </SectionHeader>
            {personalizedError && (
              <Card
                as="p"
                variant="muted"
                className="border border-rose-400/40 bg-rose-950/40 p-3 text-sm text-rose-100 sm:p-4"
              >
                {personalizedError}
              </Card>
            )}
            {personalizedMessage && (
              <Card as="p" variant="muted" className="border border-border bg-[rgba(6,22,18,0.7)] p-3 text-sm text-ink sm:p-4">
                {personalizedMessage}
              </Card>
            )}
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Panel className="p-3 sm:p-5">
                <h3 className="text-lg font-semibold text-ink">My teams</h3>
                <div className="mt-2 sm:mt-3">
                  {myTeamsLoading ? (
                    <p className="text-sm text-ink-muted">Loading teams...</p>
                  ) : myTeamInsights.length === 0 ? (
                    <p className="text-sm text-ink-muted">Follow a team to see records and fixtures here.</p>
                  ) : (
                    <div className="space-y-2">
                      {myTeamInsights.map((team) => (
                        <Card key={team.teamId} variant="muted" className="p-2.5 sm:p-3">
                          <p className="text-sm font-semibold text-ink">{team.name}</p>
                          <div className="mt-1 space-y-1 text-xs text-ink-muted">
                            {team.record && <p>Record {formatRecord(team.record)}</p>}
                            {team.nextFixture && <p>Next: {formatFixture(team.nextFixture)}</p>}
                            {team.lastResult && <p>Last: {formatResult(team.lastResult)}</p>}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
              <Panel className="p-3 sm:p-5">
                <h3 className="text-lg font-semibold text-ink">My matches</h3>
                <div className="mt-2 sm:mt-3">
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
                          eyebrow={match.event?.name || match.venue?.name || "Match"}
                          title={formatMatchup(match)}
                          meta={formatMatchMeta(match)}
                          score={isMatchLive(match.status) || isMatchFinal(match.status) ? formatLiveScore(match) : null}
                          status={formatMatchStatus(match.status) || "Scheduled"}
                          compact
                          hideFinishedVenue={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
              <Panel className="p-3 sm:p-5">
                <h3 className="text-lg font-semibold text-ink">My subscriptions</h3>
                <div className="mt-2 sm:mt-3">
                  {mySubscriptionsDetailed.length === 0 ? (
                    <p className="text-sm text-ink-muted">Follow teams, matches, or players to receive alerts.</p>
                  ) : (
                    <div className="space-y-2">
                      {mySubscriptionsDetailed.map((sub) => (
                        <Card key={sub.id} variant="muted" className="flex items-center justify-between gap-2 p-2.5 sm:gap-3 sm:p-3">
                          <div>
                            <p className="text-sm font-semibold text-ink">{sub.label}</p>
                            <p className="text-xs uppercase tracking-wide text-ink-muted">{sub.normalizedType}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          </Card>
        </SectionShell>
          )}
        </LazyHomeSection>
      )}

      <main className="space-y-0">
        <SectionShell as="section">
          <Card className="space-y-3 p-3 sm:space-y-5 sm:p-6 lg:p-7">
            <SectionHeader title="Active events" />
            {loading && safeEvents.length === 0 ? (
              <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                Loading events...
              </Card>
            ) : activeTimelineEvents.length === 0 ? (
              <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                No active events right now.
              </Card>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {activeTimelineEvents.slice(0, homeLimits.activeEvents).map((event) => (
                  <HomeEventCard key={event.id} event={event} />
                ))}
              </div>
            )}

            <div className="mt-3 border-t border-border/60 pt-3 sm:mt-6 sm:pt-4">
              <SectionHeader
                title="Upcoming events"
              />
              {loading && safeEvents.length === 0 ? (
                <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                  Loading events...
                </Card>
              ) : filteredTimelineEvents.length === 0 ? (
                <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                  {timelineEmptyMessage}
                </Card>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {filteredTimelineEvents.slice(0, homeLimits.timelineEvents).map((event) => (
                    <HomeEventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          </Card>
        </SectionShell>

        <LazyHomeSection onVisible={() => setRenderStreaming(true)} placeholderHeight={520}>
          {renderStreaming && (
          <SectionShell as="section" className="home-lazy-section__content">
            <SectionHeader
              eyebrow="Streaming"
              title="Featured broadcasts"
              description="Upcoming streams and recently completed matches with media."
            />
            <div className="grid gap-3 sm:gap-6 lg:grid-cols-2">
              <Card className="space-y-3 p-3 sm:space-y-4 sm:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Upcoming with media</p>
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
              </Card>

              <Card className="space-y-3 p-3 sm:space-y-4 sm:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recent with media</p>
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
              </Card>
            </div>
          </SectionShell>
          )}
        </LazyHomeSection>

        <LazyHomeSection onVisible={() => setRenderFinals(true)} placeholderHeight={420}>
          {renderFinals && (
          <SectionShell as="section" className="home-lazy-section__content">
            <Card className="space-y-3 p-3 sm:space-y-4 sm:p-6">
              <SectionHeader
                title="Latest results"
              />
              {finalsLoading && latestResults.length === 0 ? (
                <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                  Loading results...
                </Card>
              ) : latestResults.length === 0 ? (
                <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                  No finals saved yet.
                </Card>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                  {latestResults.map((match) => (
                    <StandardEventMatchCard
                      key={match.id}
                      match={match}
                      eyebrow={match.event?.name || "Match"}
                      title={formatMatchup(match)}
                      meta={formatMatchMeta(match)}
                      score={formatLiveScore(match)}
                      status={formatMatchStatus(match.status) || "Final"}
                      scoreAlign="right"
                    />
                  ))}
                </div>
              )}
            </Card>
          </SectionShell>
          )}
        </LazyHomeSection>

        <LazyHomeSection onVisible={() => setRenderMatches(true)} placeholderHeight={440}>
          {renderMatches && (
          <SectionShell as="section" className="home-lazy-section__content">
            <Card className="space-y-3 p-3 sm:space-y-4 sm:p-6">
              <SectionHeader
                title="Live & upcoming"
              />
              {loading && liveAndUpcomingMatches.length === 0 ? (
                <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                  Loading matches...
                </Card>
              ) : liveAndUpcomingMatches.length === 0 ? (
                <Card variant="muted" className="p-3 text-center text-sm text-ink-muted sm:p-5">
                  No open matches right now.
                </Card>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
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
                        eyebrow={match.event?.name || match.venue?.name || "Match"}
                        title={formatMatchup(match)}
                        meta={formatMatchMeta(match)}
                        score={showScore ? formatLiveScore(match) : null}
                        status={statusLabel}
                        hideFinishedVenue={false}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          </SectionShell>
          )}
        </LazyHomeSection>

      </main>

      <footer className="sc-shell mt-0">
        <div className="sc-card-muted flex flex-col gap-2 p-3 text-sm sm:gap-3 sm:p-4 md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-ink">
            {new Date().getFullYear()} StallCount. Built for Ultimate event control rooms. StallCount is a product of RCFD (Pty) Ltd. For more information contact rcfdltf@gmail.com
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
            <Link to="/matches" className="font-semibold text-accent">
              Matches
            </Link>
            <Link to="/teams" className="font-semibold text-accent">
              Teams
            </Link>
            <Link to="/players" className="font-semibold text-accent">
              Players
            </Link>
            {session && (
              <button type="button" onClick={handleLogout} disabled={signingOut} className="sc-button is-ghost">
                {signingOut ? "Signing out..." : "Log out"}
              </button>
            )}
          </div>
        </div>
        {signOutError && <p className="sc-shell pb-2 text-xs text-rose-300">{signOutError}</p>}
      </footer>
    </div>
  );
}

const HomeEventCard = memo(function HomeEventCard({ event }) {
  return (
    <Card
      as={Link}
      to={`/events?eventId=${event.id}`}
      variant="muted"
      className="block p-3 transition hover:border-accent/70 hover:text-ink sm:p-4"
    >
      <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {event.location ? `${event.location} - ` : ""}
            {formatEventType(event.type)}
          </p>
          <h3 className="text-lg font-semibold text-ink">{event.name}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="text-left text-sm text-ink-muted">
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
      meta={`${formatMatchTime(match.start_time)} | Provider: ${formatMediaProvider(match)}`}
      score={isMatchLive(match.status) || isMatchFinal(match.status) ? formatLiveScore(match) : null}
      status={formatMatchStatus(match.status) || "Scheduled"}
      compact
      hideFinishedVenue={false}
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

function formatMediaProvider(match) {
  return getMatchMediaDetails(match)?.providerLabel || getMatchMediaProviderLabel(match);
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

function formatMatchMeta(match) {
  const parts = [];
  if (match?.start_time) {
    parts.push(formatMatchTime(match.start_time));
  }
  return parts.join(" | ") || "Details pending";
}

function formatVenueDetails(match) {
  if (!match?.venue) return null;
  const city = match.venue.city ? match.venue.city.toString().trim() : "";
  const location = match.venue.location ? match.venue.location.toString().trim() : "";
  const field = match.venue.name ? match.venue.name.toString().trim() : "";
  const parts = [city, location, field].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
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
function buildTeamLookup({ featuredTeams = [], matches = [], myTeams = [] }) {
  const map = new Map();
  featuredTeams.forEach((team) => {
    if (team?.id) {
      map.set(team.id, team.name || "Team");
    }
  });
  myTeams.forEach((team) => {
    if (team?.teamId) {
      map.set(team.teamId, team.name || "Team");
    }
  });
  matches.forEach((match) => {
    if (match?.team_a?.id) {
      map.set(match.team_a.id, match.team_a.name || "Team A");
    }
    if (match?.team_b?.id) {
      map.set(match.team_b.id, match.team_b.name || "Team B");
    }
  });
  return map;
}

function buildMatchLookup(matches = []) {
  const map = new Map();
  matches.forEach((match) => {
    if (match?.id) {
      map.set(match.id, match);
    }
  });
  return map;
}

function describeSubscriptionTarget(sub, teamLookup, matchLookup, playerLookup, eventLookup) {
  const type = normalizeTargetType(sub.target_type);
  const id = sub.target_id;
  if (type === "team") {
    return teamLookup.get(id) || `Team ${id.slice(0, 4)}`;
  }
  if (type === "match") {
    const match = matchLookup.get(id);
    return match ? formatMatchup(match) : `Match ${id.slice(0, 4)}`;
  }
  if (type === "player") {
    return playerLookup?.get(id) || `Player ${id.slice(0, 4)}`;
  }
  if (type === "event") {
    return eventLookup?.get(id) || `Event ${id.slice(0, 4)}`;
  }
  if (type === "division") {
    return `Division ${id.slice(0, 4)}`;
  }
  return `Subscription ${id.slice(0, 4)}`;
}

function buildSubscriptionLink(sub) {
  const type = normalizeTargetType(sub.target_type);
  const id = sub.target_id;
  if (type === "team") return `/teams/${id}`;
  if (type === "match") return `/matches?matchId=${id}`;
  if (type === "player") return `/players/${id}`;
  if (type === "event") return `/matches?eventId=${id}`;
  if (type === "division") return "/events";
  return "/notifications";
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

function filterTimelineEvents(events = []) {
  const now = Date.now();
  return events
    .filter((event) => {
      const startTime = event.start_date ? new Date(event.start_date).getTime() : null;
      return !startTime || startTime >= now;
    })
    .sort((a, b) => {
      const aTime = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}

function filterActiveEvents(events = []) {
  const now = Date.now();
  return events
    .filter((event) => {
      const startTime = event.start_date ? new Date(event.start_date).getTime() : null;
      const endTime = event.end_date ? new Date(event.end_date).getTime() : null;
      if (startTime === null || Number.isNaN(startTime)) return false;
      if (endTime === null || Number.isNaN(endTime)) return now >= startTime;
      return now >= startTime && now <= endTime;
    })
    .sort((a, b) => {
      const aTime = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}

function formatEventType(type) {
  if (!type) return "Event";
  return type.charAt(0).toUpperCase() + type.slice(1);
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
