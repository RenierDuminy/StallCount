import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams, getTeamsByIds, getTeamMatches } from "../services/teamService";
import { getEventsList } from "../services/leagueService";
import { getTableCount } from "../services/statsService";
import { getRecentMatches, getOpenMatches, getMatchesByIds } from "../services/matchService";
import { getRecentLiveEvents } from "../services/liveEventService";
import { getSubscriptions, upsertSubscription, deleteSubscriptionById } from "../services/subscriptionService";
import { getCurrentUser } from "../services/userService";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";
import { getPlayersByIds } from "../services/playerService";
import { Card, Chip, Metric, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
import { resolveMediaProviderLabel } from "../utils/matchMedia";

const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const MAX_MY_TEAMS = 2;
const MAX_MY_MATCHES = 3;
const MAX_SUBSCRIPTIONS_PREVIEW = 4;
const MAX_FINALS_RESULTS = 16;
const MAX_UPCOMING_MATCHES = 10;

export default function HomePage() {
  const [featuredTeams, setFeaturedTeams] = useState([]);
  const [events, setEvents] = useState([]);
  const [latestMatches, setLatestMatches] = useState([]);
  const [openMatches, setOpenMatches] = useState([]);
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

  const { session } = useAuth();

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
    let canceled = false;
    let matchesTimer = null;
    let finalsTimer = null;

    const revealSections = () => {
      if (canceled) return;
      setRenderStreaming(true);
      matchesTimer = setTimeout(() => {
        if (canceled) return;
        setRenderMatches(true);
        finalsTimer = setTimeout(() => {
          if (!canceled) setRenderFinals(true);
        }, 150);
      }, 150);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(revealSections, { timeout: 800 });
      return () => {
        canceled = true;
        window.cancelIdleCallback?.(idleId);
        if (matchesTimer) clearTimeout(matchesTimer);
        if (finalsTimer) clearTimeout(finalsTimer);
      };
    }

    const fallbackTimer = setTimeout(revealSections, 120);
    return () => {
      canceled = true;
      clearTimeout(fallbackTimer);
      if (matchesTimer) clearTimeout(matchesTimer);
      if (finalsTimer) clearTimeout(finalsTimer);
    };
  }, []);
  useEffect(() => {
    let ignore = false;

    async function loadPublicData() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          toSettled(getAllTeams(8)),
          toSettled(getEventsList(40)),
          toSettled(getRecentMatches(50)),
          toSettled(getOpenMatches(20)),
          toSettled(getRecentLiveEvents(50)),
          toSettled(getTableCount("player")),
          toSettled(getTableCount("teams")),
          toSettled(getTableCount("events")),
        ]);

        if (ignore) return;

        const [
          teamsResult,
          eventsResult,
          latestMatchesResult,
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

        if (latestMatchesResult.status === "fulfilled") {
          setLatestMatches(latestMatchesResult.value);
        } else {
          failures.push("recent matches");
          console.error("[HomePage] Failed to load recent matches:", latestMatchesResult.reason);
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
  }, []);

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
  }, [session?.user?.id]);
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

  const liveNowMatch = useMemo(
    () => safeOpenMatches.find((match) => isMatchLive(match?.status)),
    [safeOpenMatches],
  );

  const liveNowEvent = liveNowMatch ? liveEventLookup.get(liveNowMatch.id) || null : null;

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
  const profileId = session?.user?.id ?? null;

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

  const subscriptionLookup = useMemo(() => {
    const map = new Map();
    (subscriptions || []).forEach((sub) => {
      const key = `${normalizeTargetType(sub.target_type)}:${sub.target_id}`;
      map.set(key, sub);
    });
    return map;
  }, [subscriptions]);

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

  const heroClockLabel = deriveClockLabel(liveNowMatch, liveNowEvent);
  const heroPointStatus = derivePointStatus(liveNowEvent);
  const heroLastEvent = formatLiveEventSummary(liveNowEvent, liveNowMatch);
  const nextMatchCountdown =
    !heroCardIsLive && nextMatchCandidate?.start_time ? formatCountdown(nextMatchCandidate.start_time) : null;
  const heroCardSubscription = heroCardMatch ? subscriptionLookup.get(`match:${heroCardMatch.id}`) || null : null;
  const heroStreamUrl = heroCardMatch ? resolveStreamUrl(heroCardMatch) : null;
  const heroTrackerHref = heroCardMatch ? buildMatchLink(heroCardMatch.id) : "/matches";
  const heroNotificationHref = heroCardMatch ? `/notifications?targetType=match&targetId=${heroCardMatch.id}` : "/notifications";
  const heroCardMatchId = heroCardMatch?.id || null;

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
    return Array.from(map.values()).filter((match) => matchHasStream(match));
  }, [safeOpenMatches, safeLatestMatches]);

  const upcomingStreamMatches = useMemo(() => {
    return streamMatches
      .filter((match) => !isMatchFinal(match?.status))
      .sort((a, b) => {
        const aTime = a?.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b?.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 5);
  }, [streamMatches]);

  const recentStreamMatches = useMemo(() => {
    return streamMatches
      .filter((match) => (match?.status || "").toLowerCase() === "completed")
      .map((match) => ({ match, completedTime: getMatchCompletionTime(match) }))
      .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0))
      .slice(0, 10)
      .map(({ match }) => match);
  }, [streamMatches]);

  const spotlightEvent = useMemo(
    () => pickSpotlightEvent(filteredTimelineEvents, safeEvents),
    [filteredTimelineEvents, safeEvents],
  );

  const forYouLoading = personalizedLoading || myTeamsLoading || myMatchesLoading;
  const liveAndUpcomingMatches = useMemo(() => {
    const filtered = safeOpenMatches.filter((match) => match?.id !== heroCardMatchId);
    const sortByStartTime = (list) =>
      list.sort((a, b) => {
        const aTime = a?.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b?.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    const liveMatches = sortByStartTime(filtered.filter((match) => isMatchLive(match.status)));
    const upcomingMatches = sortByStartTime(filtered.filter((match) => !isMatchLive(match.status)));
    return [...liveMatches, ...upcomingMatches].slice(0, MAX_UPCOMING_MATCHES);
  }, [safeOpenMatches, heroCardMatchId]);
  const latestResults = useMemo(() => {
    return safeLatestMatches
      .map((match) => ({ match, completedTime: getMatchCompletionTime(match) }))
      .filter(
        ({ match, completedTime }) =>
          Boolean(match?.id) && match.id !== heroCardMatchId && isMatchFinal(match?.status) && completedTime !== null,
      )
      .sort((a, b) => (b.completedTime ?? 0) - (a.completedTime ?? 0))
      .slice(0, MAX_FINALS_RESULTS)
      .map(({ match }) => match);
  }, [safeLatestMatches, heroCardMatchId]);

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

  async function handleFollowMatch(matchId) {
    if (!matchId) return;
    if (!profileId) {
      setHeroActionStatus("Sign in to follow matches.");
      return;
    }
    try {
      const row = await upsertSubscription({
        profileId,
        targetType: "match",
        targetId: matchId,
        topics: ["live", "final"],
      });
      setSubscriptions((prev) => upsertSubscriptionState(prev, row));
      setHeroActionStatus("Match added to your alerts.");
    } catch (err) {
      setHeroActionStatus(err?.message || "Unable to follow this match.");
    }
  }

  async function handleUnfollowSubscriptionRow(row) {
    if (!row?.id) return;
    try {
      await deleteSubscriptionById(row.id);
      setSubscriptions((prev) => prev.filter((sub) => sub.id !== row.id));
      setHeroActionStatus("Subscription removed.");
    } catch (err) {
      setHeroActionStatus(err?.message || "Unable to update subscription.");
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

  const handleToggleHeroSubscription = () => {
    if (!heroCardMatch) return;
    if (heroCardSubscription) {
      void handleUnfollowSubscriptionRow(heroCardSubscription);
    } else {
      void handleFollowMatch(heroCardMatch.id);
    }
  };

  return (
    <div className="pb-20 text-ink">
      <SectionShell as="header" className="space-y-6 pt-8 pb-2">
        <Card className="sc-hero p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr,0.95fr] lg:items-start">
            <div className="space-y-6">
              <div className="space-y-4">
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
            <div className="space-y-4">
              <Card
                variant="muted"
                className={`sc-frosted sc-live-card p-5 ${
                  heroCardIsLive ? "is-live border-2 border-rose-500/70 bg-rose-500/10" : ""
                }`}
              >
                <div className={`flex flex-col gap-5 ${heroStreamUrl ? "sm:flex-row sm:items-center sm:justify-between" : ""}`}>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      <span>{heroCardIsLive ? "Live now" : "Next up"}</span>
                      {heroCardIsLive && (
                        <span className="sc-live-badge inline-flex items-center gap-2 rounded-full border border-rose-400/60 bg-rose-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-100">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-200 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-200" />
                          </span>
                          Live
                        </span>
                      )}
                      {heroPointStatus && heroCardIsLive && <Chip as="span">{heroPointStatus} point</Chip>}
                    </div>
                    {heroCardIsLive && heroCardMatch && (
                      <div className="flex flex-wrap items-baseline gap-3">
                        <p className="sc-live-score text-3xl font-semibold text-rose-50">
                          {formatLiveScore(heroCardMatch)}
                        </p>
                        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-100/90">
                          Live match
                        </span>
                      </div>
                    )}
                    <p className={`text-2xl font-semibold ${heroCardIsLive ? "text-rose-50" : "text-ink"}`}>
                      {heroCardMatch ? formatMatchup(heroCardMatch) : "No matches scheduled"}
                    </p>
                    {heroCardIsLive ? (
                      <p className="text-sm text-ink-muted">
                        {heroClockLabel || "Waiting for next score update"}
                      </p>
                    ) : heroCardMatch ? (
                      <div className="space-y-1">
                        {nextMatchCountdown && (
                          <div className="flex items-center gap-2 text-rose-50">
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-10 w-10">
                              <path
                                fill="currentColor"
                                d="M12 2a1 1 0 0 1 1 1v1.05a7.95 7.95 0 0 1 3.75 1.56l.75-.75a1 1 0 1 1 1.4 1.42l-.74.74A8 8 0 1 1 12 4.05V3a1 1 0 0 1 1-1zm0 4a6 6 0 1 0 6 6 6.01 6.01 0 0 0-6-6zm-.5 2a1 1 0 0 1 1 1v3.2l2.3 1.3a1 1 0 1 1-1 1.74l-2.8-1.6A1 1 0 0 1 11 13V9a1 1 0 0 1 1-1z"
                              />
                            </svg>
                            <p className="text-3xl font-semibold">{nextMatchCountdown}</p>
                          </div>
                        )}
                        <p className="text-sm text-ink-muted">
                          Scheduled: {formatHeadingDateTime(heroCardMatch.start_time)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-ink-muted">Add matches to see them here.</p>
                    )}
                    {heroCardIsLive && (
                      <p className="text-xs uppercase tracking-wide text-ink-muted">
                        Last event: <span className="text-ink">{heroLastEvent || "No logs yet"}</span>
                      </p>
                    )}
                    {!heroCardIsLive && heroCardMatch && formatVenueDetails(heroCardMatch) && (
                      <p className="text-xs text-ink-muted">{formatVenueDetails(heroCardMatch)}</p>
                    )}
                  </div>
                  {heroStreamUrl && (
                    <a
                      href={heroStreamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="sc-live-watch group inline-flex items-center gap-3 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-rose-50"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-rose-300/50 bg-rose-500/20">
                        <img src="/youtube.png" alt="" className="h-9 w-9" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-[0.3em]">Watch</span>
                    </a>
                  )}
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {heroCardIsLive ? (
                    <Link to={heroTrackerHref} className="sc-button text-center">
                      Open live tracker
                    </Link>
                  ) : (
                    <Link to={heroNotificationHref} className="sc-button text-center">
                      Notifications
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleShareMatch(heroCardMatch)}
                    className="sc-button is-ghost"
                    disabled={!heroCardMatch}
                  >
                    Share
                  </button>
                  {!heroStreamUrl && (
                    <Panel
                      variant="dashed"
                      className="flex items-center justify-center px-3 py-2 text-center text-xs uppercase tracking-wide text-ink-muted"
                    >
                      No stream linked
                    </Panel>
                  )}
                </div>
              </Card>
              <Panel variant="tinted" className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <span>Next scheduled</span>
                  {nextScheduledMatch?.start_time && (
                    <span>{formatHeadingDateTime(nextScheduledMatch.start_time)}</span>
                  )}
                </div>
                <p className="text-sm text-ink">{myNextMatchAnswer}</p>
              </Panel>
              {error && (
                <p className="rounded-2xl border border-rose-400/30 bg-rose-950/50 p-4 text-sm font-semibold text-rose-100">
                  {error}
                </p>
              )}
            </div>
          </div>
        </Card>
      </SectionShell>
      {isLoggedIn && (
        <SectionShell as="section">
          <Card className="space-y-5 p-5 sm:p-6">
            <SectionHeader
              eyebrow="For you"
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
                className="border border-rose-400/40 bg-rose-950/40 p-4 text-sm text-rose-100"
              >
                {personalizedError}
              </Card>
            )}
            {personalizedMessage && (
              <Card as="p" variant="muted" className="border border-border bg-[rgba(6,22,18,0.7)] p-4 text-sm text-ink">
                {personalizedMessage}
              </Card>
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-ink">My teams</h3>
                <div className="mt-3">
                  {myTeamsLoading ? (
                    <p className="text-sm text-ink-muted">Loading teams...</p>
                  ) : myTeamInsights.length === 0 ? (
                    <p className="text-sm text-ink-muted">Follow a team to see records and fixtures here.</p>
                  ) : (
                    <div className="space-y-2">
                      {myTeamInsights.map((team) => (
                        <Card key={team.teamId} variant="muted" className="p-3">
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
              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-ink">My matches</h3>
                <div className="mt-3">
                  {myMatchesLoading ? (
                    <p className="text-sm text-ink-muted">Loading matches...</p>
                  ) : myMatchInsights.length === 0 ? (
                    <p className="text-sm text-ink-muted">Follow matches to keep them pinned here.</p>
                  ) : (
                    <div className="space-y-2">
                      {myMatchInsights.map((match) => (
                        <Card key={match.id} as="article" variant="muted" className="p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {match.event?.name || match.venue?.name || "Match"}
                          </p>
                          <p className="text-sm font-semibold text-ink">{formatMatchup(match)}</p>
                          <p className="text-xs text-ink-muted">{formatMatchMeta(match)}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Link to={`/matches?matchId=${match.id}`} className="sc-button is-ghost text-xs">
                              Open
                            </Link>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-ink">My subscriptions</h3>
                <div className="mt-3">
                  {mySubscriptionsDetailed.length === 0 ? (
                    <p className="text-sm text-ink-muted">Follow teams, matches, or players to receive alerts.</p>
                  ) : (
                    <div className="space-y-2">
                      {mySubscriptionsDetailed.map((sub) => (
                        <Card key={sub.id} variant="muted" className="flex items-center justify-between gap-3 p-3">
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

      <main className="space-y-12">
        <SectionShell as="section">
          <Card className="space-y-5 p-5 sm:p-6 lg:p-7">
            <SectionHeader eyebrow="Timeline" title="Active events" />
            {loading && safeEvents.length === 0 ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                Loading events...
              </Card>
            ) : activeTimelineEvents.length === 0 ? (
              <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                No active events right now.
              </Card>
            ) : (
              <div className="space-y-3">
                {activeTimelineEvents.slice(0, 6).map((event) => (
                  <Card key={event.id} as="article" variant="muted" className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {event.location ? `${event.location} - ` : ""}
                          {formatEventType(event.type)}
                        </p>
                        <h3 className="text-lg font-semibold text-ink">{event.name}</h3>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <p className="text-sm text-ink-muted text-left">
                          {formatDateRange(event.start_date, event.end_date)}
                        </p>
                        <Link to={`/events?eventId=${event.id}`} className="sc-button is-ghost inline-flex text-xs">
                          View matches
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div className="mt-6 border-t border-border/60 pt-4">
              <SectionHeader
                title="Upcoming events"
              />
              {loading && safeEvents.length === 0 ? (
                <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                  Loading events...
                </Card>
              ) : filteredTimelineEvents.length === 0 ? (
                <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                  {timelineEmptyMessage}
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredTimelineEvents.slice(0, 8).map((event) => (
                    <Card key={event.id} as="article" variant="muted" className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {event.location ? `${event.location} - ` : ""}
                            {formatEventType(event.type)}
                          </p>
                          <h3 className="text-lg font-semibold text-ink">{event.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <p className="text-sm text-ink-muted text-left">
                            {formatDateRange(event.start_date, event.end_date)}
                          </p>
                          <Link to={`/events?eventId=${event.id}`} className="sc-button is-ghost inline-flex text-xs">
                            View matches
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </SectionShell>

        {renderStreaming && (
          <SectionShell as="section" className="grid gap-6 lg:grid-cols-2">
            <Card className="space-y-3 p-5 sm:p-6">
              <SectionHeader eyebrow="Streaming" title="Featured broadcast" />
              {upcomingStreamMatches.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next with media</p>
                  {upcomingStreamMatches.map((match) => (
                    <Card key={match.id} variant="muted" className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{formatMatchup(match)}</p>
                          <p className="text-xs text-ink-muted">{formatMatchTime(match.start_time)}</p>
                          <p className="text-xs text-ink-muted">Provider: {formatMediaProvider(match)}</p>
                        </div>
                        {resolveStreamUrl(match) && (
                          <a
                            href={resolveStreamUrl(match)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open stream"
                            className="inline-flex items-center justify-center pr-2"
                          >
                            <img src="/youtube.png" alt="" className="h-8 w-8" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No upcoming matches with media linked.</p>
              )}

              {recentStreamMatches.length > 0 ? (
                <div className="space-y-3 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recent with media</p>
                  {recentStreamMatches.map((match) => (
                    <Card key={match.id} variant="muted" className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{formatMatchup(match)}</p>
                          <p className="text-xs text-ink-muted">{formatMatchTime(match.start_time)}</p>
                          <p className="text-xs text-ink-muted">Provider: {formatMediaProvider(match)}</p>
                        </div>
                        {resolveStreamUrl(match) && (
                          <a
                            href={resolveStreamUrl(match)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open stream"
                            className="inline-flex items-center justify-center pr-2"
                          >
                            <img src="/youtube.png" alt="" className="h-8 w-8" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted pt-3">No recent matches with media linked.</p>
              )}
            </Card>
          </SectionShell>
        )}

        {renderMatches && (
          <SectionShell as="section">
            <Card className="space-y-4 p-5 sm:p-6">
              <SectionHeader
                eyebrow="Matches"
                title="Live & upcoming"
              />
              {loading && liveAndUpcomingMatches.length === 0 ? (
                <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                  Loading matches...
                </Card>
              ) : liveAndUpcomingMatches.length === 0 ? (
                <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                  No open matches right now.
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {liveAndUpcomingMatches.map((match) => {
                    const live = isMatchLive(match.status);
                    const final = isMatchFinal(match.status);
                    const showScore = live || final;
                    return (
                      <Panel key={match.id} as="article" variant="tintedAlt" className="flex flex-col gap-3 p-4">
                        <div className="flex flex-col gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                              {match.event?.name || match.venue?.name || "Match"}
                            </p>
                            <h3 className="text-lg font-semibold text-ink">{formatMatchup(match)}</h3>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-ink-muted">{formatMatchMeta(match)}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link to={`/matches?matchId=${match.id}`} className="sc-button is-ghost text-xs">
                                {live ? "Live tracker" : "Details"}
                              </Link>
                              {matchHasStream(match) && (
                                <a
                                  href={resolveStreamUrl(match)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="sc-button is-ghost text-xs"
                                >
                                  Watch
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-left">
                            {showScore ? (
                              <>
                                <p className="text-2xl font-semibold text-accent">{formatLiveScore(match)}</p>
                                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                  {formatMatchStatus(match.status) || (live ? "Live" : "Final")}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                {formatMatchStatus(match.status) || "Scheduled"}
                              </p>
                            )}
                          </div>
                          <div />
                        </div>
                      </Panel>
                    );
                  })}
                </div>
              )}
            </Card>
          </SectionShell>
        )}

        {renderFinals && (
          <SectionShell as="section">
            <Card className="space-y-4 p-5 sm:p-6">
              <SectionHeader
                eyebrow="Finals"
                title="Latest results"
                action={
                  <Link to="/events" className="sc-button is-ghost">
                    Match archive
                  </Link>
                }
              />
              {loading && latestResults.length === 0 ? (
                <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                  Loading results...
                </Card>
              ) : latestResults.length === 0 ? (
                <Card variant="muted" className="p-5 text-center text-sm text-ink-muted">
                  No finals saved yet.
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {latestResults.map((match) => (
                    <Panel
                      key={match.id}
                      as={Link}
                      variant="tinted"
                      to={`/matches?matchId=${match.id}`}
                      className="block p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {match.event?.name || "Match"}
                          </p>
                          <h3 className="text-lg font-semibold text-ink">{formatMatchup(match)}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-accent">{formatLiveScore(match)}</p>
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {match.status || "final"}
                          </p>
                        </div>
                      </div>
                    </Panel>
                  ))}
                </div>
              )}
            </Card>
          </SectionShell>
        )}

      </main>

      <footer className="sc-shell mt-10">
        <div className="sc-card-muted flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-ink">
            {new Date().getFullYear()} StallCount. Built for Ultimate event control rooms. StallCount is a product of RCFD (Pty) Ltd. For more information contact rcfdltf@gmail.com
          </p>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
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
function formatDateRange(start, end) {
  if (!start && !end) return "Dates pending";
  const startDate = start ? new Date(start).toLocaleDateString() : "TBD";
  const endDate = end ? new Date(end).toLocaleDateString() : null;
  return endDate && endDate !== startDate ? `${startDate} - ${endDate}` : startDate;
}

function toSettled(promise) {
  return promise
    .then((value) => ({ status: "fulfilled", value }))
    .catch((reason) => ({ status: "rejected", reason }));
}

function formatMatchTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

function formatScheduledShort(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = date.toLocaleDateString([], { day: "2-digit", month: "short", year: "2-digit" });
  return `${time}, ${day}`;
}

function formatHeadingDateTime(timestamp) {
  if (!timestamp) return "Start time pending";
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
  return `${time}, ${day}`;
}

function formatMatchup(match) {
  const teamA = match.team_a?.name || "Team A";
  const teamB = match.team_b?.name || "Team B";
  return `${teamA} vs ${teamB}`;
}

function matchHasStream(match) {
  if (!match) return false;
  if (typeof match.media_url === "string" && match.media_url.trim()) return true;
  if (match.has_media) return true;
  const primaryUrl = match.media_link?.primary?.url;
  return typeof primaryUrl === "string" && primaryUrl.trim().length > 0;
}

function formatMediaProvider(match) {
  const provider = match?.media_provider;
  const url = resolveStreamUrl(match);
  return resolveMediaProviderLabel(provider, url);
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
  if (match?.venue?.name) {
    parts.push(match.venue.name);
  }
  return parts.join(" | ") || "Details pending";
}

function formatMatchVenue(match) {
  if (match.venue?.name) return match.venue.name;
  if (match.event?.name) return match.event.name;
  return match.start_time ? formatMatchTime(match.start_time) : "Venue TBD";
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

function resolveStreamUrl(match) {
  if (!match) return null;
  if (typeof match.media_url === "string" && match.media_url.trim()) return match.media_url;
  const primaryUrl = match.media_link?.primary?.url;
  if (typeof primaryUrl === "string" && primaryUrl.trim()) return primaryUrl;
  return null;
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

function formatCountdown(timestamp) {
  if (!timestamp) return null;
  const target = new Date(timestamp).getTime();
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "Now";
  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  const totalHours = Math.floor(totalMinutes / 60);
  let days = Math.floor(totalHours / 24);
  let hours = totalHours % 24;
  let minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (totalMinutes < 60) {
    let approxMinutes = Math.max(10, Math.round(minutes / 10) * 10);
    if (approxMinutes === 60) {
      approxMinutes = 50;
    }
    parts.push(`~${approxMinutes}min`);
  }
  return parts.join(" ");
}

function pickSpotlightEvent(filteredEvents, allEvents) {
  if (filteredEvents && filteredEvents.length > 0) {
    return filteredEvents[0];
  }
  return allEvents?.[0] || null;
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
function upsertSubscriptionState(list = [], row) {
  const next = list.filter((item) => item.id !== row.id);
  next.unshift(row);
  return next;
}

function isMatchLive(status) {
  return LIVE_STATUSES.has((status || "").toLowerCase());
}

function isMatchFinal(status) {
  return FINISHED_STATUSES.has((status || "").toLowerCase());
}
