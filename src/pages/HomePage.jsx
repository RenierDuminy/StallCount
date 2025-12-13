import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllTeams, getTeamsByIds, getTeamMatches } from "../services/teamService";
import { getDivisions, getEventsList } from "../services/leagueService";
import { getTableCount } from "../services/statsService";
import { getRecentMatches, getOpenMatches, getMatchesByIds } from "../services/matchService";
import { getRecentLiveEvents } from "../services/liveEventService";
import { getSubscriptions, upsertSubscription, deleteSubscriptionById } from "../services/subscriptionService";
import { getCurrentUser } from "../services/userService";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";

const LIVE_STATUSES = new Set(["live", "halftime"]);
const FINISHED_STATUSES = new Set(["finished", "completed"]);
const TIMELINE_TYPES = ["all", "league", "tournament", "internal", "testing"];
const TIMELINE_SCOPES = ["current", "upcoming", "completed", "all"];
const MAX_MY_TEAMS = 2;
const MAX_MY_MATCHES = 3;
const MAX_SUBSCRIPTIONS_PREVIEW = 4;

export default function HomePage() {
  const [featuredTeams, setFeaturedTeams] = useState([]);
  const [divisions, setDivisions] = useState([]);
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
  const [myTeamsLoading, setMyTeamsLoading] = useState(false);
  const [myMatchesLoading, setMyMatchesLoading] = useState(false);

  const [timelineScope, setTimelineScope] = useState("current");
  const [timelineTypeFilter, setTimelineTypeFilter] = useState("all");
  const [nearMeOnly, setNearMeOnly] = useState(false);
  const [homeBase, setHomeBase] = useState(() => readStoredHomeBase());

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);

  const { session } = useAuth();

  useEffect(() => {
    writeStoredHomeBase(homeBase);
  }, [homeBase]);

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
    let ignore = false;

    async function loadPublicData() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          toSettled(getAllTeams(8)),
          toSettled(getDivisions(6)),
          toSettled(getEventsList(40)),
          toSettled(getRecentMatches(6)),
          toSettled(getOpenMatches(20)),
          toSettled(getRecentLiveEvents(50)),
          toSettled(getTableCount("player")),
          toSettled(getTableCount("teams")),
          toSettled(getTableCount("events")),
        ]);

        if (ignore) return;

        const [
          teamsResult,
          divisionsResult,
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

        if (divisionsResult.status === "fulfilled") {
          setDivisions(divisionsResult.value);
        } else {
          failures.push("divisions");
          console.error("[HomePage] Failed to load divisions:", divisionsResult.reason);
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

  const safeDivisions = useMemo(() => divisions ?? [], [divisions]);
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
    const futureSorted = [...safeOpenMatches]
      .filter((match) => !FINISHED_STATUSES.has((match?.status || "").toLowerCase()))
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

  const mySubscriptionsDetailed = useMemo(
    () =>
      mySubscriptionsPreview.map((sub) => ({
        ...sub,
        normalizedType: normalizeTargetType(sub.target_type),
        label: describeSubscriptionTarget(sub, teamLookup, matchLookup),
        href: buildSubscriptionLink(sub),
      })),
    [mySubscriptionsPreview, teamLookup, matchLookup],
  );

  const heroCardMatch = liveNowMatch || nextMatchCandidate || null;
  const heroCardIsLive = Boolean(liveNowMatch);
  const heroClockLabel = deriveClockLabel(liveNowMatch, liveNowEvent);
  const heroPointStatus = derivePointStatus(liveNowEvent);
  const heroLastEvent = formatLiveEventSummary(liveNowEvent, liveNowMatch);
  const nextMatchCountdown =
    !heroCardIsLive && nextMatchCandidate?.start_time ? formatCountdown(nextMatchCandidate.start_time) : null;
  const heroCardSubscription = heroCardMatch ? subscriptionLookup.get(`match:${heroCardMatch.id}`) || null : null;
  const heroStreamUrl = heroCardMatch ? resolveStreamUrl(heroCardMatch) : null;
  const heroTrackerHref = heroCardMatch ? buildMatchLink(heroCardMatch.id) : "/matches";
  const heroCardMatchId = heroCardMatch?.id || null;

  const homeBaseLabel = typeof homeBase === "string" ? homeBase.trim() : "";
  const filteredTimelineEvents = useMemo(
    () =>
      filterTimelineEvents(safeEvents, {
        scope: timelineScope,
        type: timelineTypeFilter,
        nearMeOnly: nearMeOnly && Boolean(homeBaseLabel),
        homeBase: homeBaseLabel,
      }),
    [safeEvents, timelineScope, timelineTypeFilter, nearMeOnly, homeBaseLabel],
  );
  const nearMeRequiresLocation = nearMeOnly && !homeBaseLabel;
  const timelineEmptyMessage = nearMeRequiresLocation
    ? "Set your home base to use the Near me filter."
    : "No events match the current filters.";
  const timelineScopeLabel = formatTimelineScopeLabel(timelineScope);

  const upcomingStreamMatch = useMemo(
    () => safeOpenMatches.find((match) => matchHasStream(match)),
    [safeOpenMatches],
  );

  const spotlightEvent = useMemo(
    () => pickSpotlightEvent(filteredTimelineEvents, safeEvents),
    [filteredTimelineEvents, safeEvents],
  );

  const myTasks = useMemo(() => deriveTaskList(safeOpenMatches), [safeOpenMatches]);
  const forYouLoading = personalizedLoading || myTeamsLoading || myMatchesLoading;
  const liveAndUpcomingMatches = useMemo(() => {
    return safeOpenMatches.filter((match) => match?.id !== heroCardMatchId).slice(0, 5);
  }, [safeOpenMatches, heroCardMatchId]);
  const latestResults = useMemo(() => {
    return safeLatestMatches.filter((match) => isMatchFinal(match.status) && match?.id !== heroCardMatchId).slice(0, 4);
  }, [safeLatestMatches, heroCardMatchId]);

  const heroStats = [
    { label: "Registered teams", value: stats.teams },
    { label: "Rostered players", value: stats.players },
    { label: "Tracked events", value: stats.events },
  ];

  const heroQuestionCards = [
    {
      label: "What's live right now?",
      answer: liveNowMatch ? `${formatMatchup(liveNowMatch)} - ${formatLiveScore(liveNowMatch)}` : "Nothing live",
    },
    {
      label: "What's my next match?",
      answer: nextMatchCandidate
        ? `${formatMatchup(nextMatchCandidate)} - ${formatMatchVenue(nextMatchCandidate)}`
        : "Add your fixtures",
    },
    {
      label: "How do I start scoring?",
      answer: "Open the scorekeeper, assign a crew, and log every touch.",
      href: "/scorekeeper",
    },
    {
      label: "Where do I see standings?",
      answer: "Dive into divisions for live ladders and tiebreakers.",
      href: "/divisions",
    },
  ];

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

  const handlePromptHomeBase = () => {
    if (typeof window === "undefined") return;
    const next = window.prompt("Where should we treat as your home base?", homeBaseLabel);
    if (next === null) return;
    setHomeBase(next.trim());
  };

  const handleClearHomeBase = () => {
    setHomeBase("");
    setNearMeOnly(false);
  };
  return (
    <div className="pb-20 text-[var(--sc-ink)]">
      <header className="sc-shell space-y-6 py-8">
        <div className="sc-card-base sc-hero p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr,0.95fr] lg:items-start">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--sc-ink-muted)]">
                  Ultimate ops console
                </p>
                <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
                  Know what's live, what's next, and who's responsible.
                </h1>
                <p className="max-w-2xl text-sm text-[var(--sc-ink-muted)]">
                  This homepage answers four Ultimate operations questions: live scores, the next assignment, how to
                  start scoring, and where to see standings.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {heroQuestionCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-[var(--sc-border)]/60 bg-[rgba(10,29,24,0.8)] p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                      {card.label}
                    </p>
                    <p className="text-sm text-[var(--sc-ink)]">{card.answer}</p>
                    {card.href && (
                      <Link to={card.href} className="mt-2 inline-flex text-xs font-semibold text-[var(--sc-accent)]">
                        Jump in {"->"}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/scorekeeper" className="sc-button">
                  Start scoring
                </Link>
                <Link to="/matches" className="sc-button is-ghost">
                  Follow matches
                </Link>
                <Link to="/divisions" className="sc-button is-ghost">
                  Standings
                </Link>
              </div>
              <div className="flex flex-wrap gap-3">
                {heroStats.map((item) => (
                  <div key={item.label} className="sc-metric">
                    <strong>{loading ? "..." : item.value}</strong>
                    <span className="text-sm text-[var(--sc-ink-muted)]">{item.label}</span>
                  </div>
                ))}
              </div>
              {heroActionStatus && (
                <p className="text-xs font-semibold text-[var(--sc-accent)]">{heroActionStatus}</p>
              )}
            </div>
            <div className="space-y-4">
              <div className="sc-card-muted sc-frosted p-5">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                  <span>{heroCardIsLive ? "Live now" : "Next up"}</span>
                  {heroPointStatus && heroCardIsLive && <span className="sc-chip">{heroPointStatus} point</span>}
                </div>
                <p className="mt-2 text-xl font-semibold text-[var(--sc-ink)]">
                  {heroCardMatch ? formatMatchup(heroCardMatch) : "No matches scheduled"}
                </p>
                <p className="text-sm text-[var(--sc-ink-muted)]">
                  {heroCardIsLive
                    ? heroClockLabel || "Waiting for next score update"
                    : heroCardMatch
                      ? nextMatchCountdown || formatMatchTime(heroCardMatch.start_time)
                      : "Add matches to see them here."}
                </p>
                {heroCardIsLive && (
                  <p className="mt-2 text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">
                    Last event: <span className="text-[var(--sc-ink)]">{heroLastEvent || "No logs yet"}</span>
                  </p>
                )}
                {!heroCardIsLive && heroCardMatch?.venue?.name && (
                  <p className="mt-2 text-xs text-[var(--sc-ink-muted)]">Field: {heroCardMatch.venue.name}</p>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Link to={heroTrackerHref} className="sc-button text-center">
                    {heroCardIsLive ? "Open live tracker" : "Match hub"}
                  </Link>
                  <button type="button" onClick={handleToggleHeroSubscription} className="sc-button is-ghost">
                    {heroCardSubscription ? "Subscribed" : "Subscribe"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShareMatch(heroCardMatch)}
                    className="sc-button is-ghost"
                    disabled={!heroCardMatch}
                  >
                    Share
                  </button>
                  {heroStreamUrl ? (
                    <a href={heroStreamUrl} target="_blank" rel="noreferrer" className="sc-button is-ghost text-center">
                      Stream
                    </a>
                  ) : (
                    <div className="flex items-center justify-center rounded-2xl border border-dashed border-[var(--sc-border)]/70 px-3 py-2 text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">
                      No stream linked
                    </div>
                  )}
                </div>
              </div>
              {error && (
                <p className="rounded-2xl border border-rose-400/30 bg-rose-950/50 p-4 text-sm font-semibold text-rose-100">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>
      {isLoggedIn && (
        <section className="sc-shell space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sc-chip">For you</p>
              <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">My teams, matches, alerts</h2>
              <p className="text-sm text-[var(--sc-ink-muted)]">
                Personalized answers to the same four questions once you sign in.
              </p>
              {profile?.full_name && (
                <p className="text-xs text-[var(--sc-ink-muted)]">Signed in as {profile.full_name}</p>
              )}
            </div>
            {forYouLoading && (
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">Refreshing...</span>
            )}
          </div>
          {personalizedError && (
            <p className="rounded-2xl border border-rose-400/40 bg-rose-950/40 p-4 text-sm text-rose-100">
              {personalizedError}
            </p>
          )}
          {personalizedMessage && (
            <p className="rounded-2xl border border-[var(--sc-border)] bg-[rgba(6,22,18,0.7)] p-4 text-sm text-[var(--sc-ink)]">
              {personalizedMessage}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="sc-card-base space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--sc-ink)]">My teams</h3>
                <Link to="/teams" className="sc-button is-ghost">
                  Manage
                </Link>
              </div>
              {myTeamsLoading ? (
                <p className="text-sm text-[var(--sc-ink-muted)]">Loading teams...</p>
              ) : myTeamInsights.length === 0 ? (
                <p className="text-sm text-[var(--sc-ink-muted)]">Follow a team to see records and fixtures here.</p>
              ) : (
                <div className="space-y-3">
                  {myTeamInsights.map((team) => (
                    <div key={team.teamId} className="rounded-xl border border-[var(--sc-border)]/70 p-3">
                      <p className="text-sm font-semibold text-[var(--sc-ink)]">{team.name}</p>
                      {team.record && <p className="text-xs text-[var(--sc-ink-muted)]">Record {formatRecord(team.record)}</p>}
                      {team.nextFixture && (
                        <p className="text-xs text-[var(--sc-ink-muted)]">Next: {formatFixture(team.nextFixture)}</p>
                      )}
                      {team.lastResult && (
                        <p className="text-xs text-[var(--sc-ink-muted)]">Last: {formatResult(team.lastResult)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sc-card-base space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--sc-ink)]">My matches</h3>
                <Link to="/matches" className="sc-button is-ghost">
                  Match hub
                </Link>
              </div>
              {myMatchesLoading ? (
                <p className="text-sm text-[var(--sc-ink-muted)]">Loading matches...</p>
              ) : myMatchInsights.length === 0 ? (
                <p className="text-sm text-[var(--sc-ink-muted)]">Follow matches to keep them pinned here.</p>
              ) : (
                <div className="space-y-3">
                  {myMatchInsights.map((match) => (
                    <article key={match.id} className="rounded-xl border border-[var(--sc-border)]/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                        {match.event?.name || match.venue?.name || "Match"}
                      </p>
                      <p className="text-sm font-semibold text-[var(--sc-ink)]">{formatMatchup(match)}</p>
                            <p className="text-xs text-[var(--sc-ink-muted)]">{formatMatchMeta(match)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link to={`/matches?matchId=${match.id}`} className="sc-button is-ghost text-xs">
                          Open
                        </Link>
                        <Link to="/scorekeeper" className="sc-button is-ghost text-xs">
                          Score
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="sc-card-base space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--sc-ink)]">My subscriptions</h3>
                <Link to="/notifications" className="sc-button is-ghost">
                  Alerts
                </Link>
              </div>
              {mySubscriptionsDetailed.length === 0 ? (
                <p className="text-sm text-[var(--sc-ink-muted)]">Follow teams, matches, or players to receive alerts.</p>
              ) : (
                <div className="space-y-2">
                  {mySubscriptionsDetailed.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sc-border)]/70 p-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--sc-ink)]">{sub.label}</p>
                        <p className="text-xs uppercase tracking-wide text-[var(--sc-ink-muted)]">{sub.normalizedType}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleUnfollowSubscriptionRow(sub)}
                        className="sc-button is-ghost text-xs"
                      >
                        Unfollow
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sc-card-base space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--sc-ink)]">My tasks</h3>
                <Link to="/dashboard" className="sc-button is-ghost">
                  Dashboard
                </Link>
              </div>
              {myTasks.length === 0 ? (
                <p className="text-sm text-[var(--sc-ink-muted)]">You're all caught up. Enjoy the games!</p>
              ) : (
                <ul className="space-y-2">
                  {myTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sc-border)]/70 p-3">
                      <span className="text-sm text-[var(--sc-ink)]">{task.label}</span>
                      {task.href && (
                        <Link to={task.href} className="sc-button is-ghost text-xs">
                          {task.cta || "Review"}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <main className="space-y-12">
        <section className="sc-shell">
          <div className="sc-card-base space-y-5 p-5 sm:p-6 lg:p-7">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="sc-chip">Timeline</p>
                  <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">{timelineScopeLabel}</h2>
                  <p className="text-sm text-[var(--sc-ink-muted)]">Season/event selector, type chips, and a near-me filter.</p>
                </div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                  Scope
                  <select
                    className="ml-2 rounded-lg border border-[var(--sc-border)] bg-transparent px-2 py-1 text-[var(--sc-ink)]"
                    value={timelineScope}
                    onChange={(event) => setTimelineScope(event.target.value)}
                  >
                    {TIMELINE_SCOPES.map((scope) => (
                      <option key={scope} value={scope}>
                        {formatTimelineScopeLabel(scope)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {TIMELINE_TYPES.map((type) => {
                  const isActive = timelineTypeFilter === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTimelineTypeFilter(type)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        isActive
                          ? "border-[var(--sc-accent)] text-[var(--sc-ink)]"
                          : "border-[var(--sc-border)] text-[var(--sc-ink-muted)]"
                      }`}
                    >
                      {type === "all" ? "All" : type}
                    </button>
                  );
                })}
                <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                  <input
                    type="checkbox"
                    className="rounded border-[var(--sc-border)] bg-transparent"
                    checked={nearMeOnly}
                    onChange={(event) => setNearMeOnly(event.target.checked)}
                  />
                  Near me
                </label>
                {homeBaseLabel ? (
                  <button type="button" className="sc-button is-ghost text-xs" onClick={handleClearHomeBase}>
                    {homeBaseLabel}
                  </button>
                ) : (
                  <button type="button" className="sc-button is-ghost text-xs" onClick={handlePromptHomeBase}>
                    Set home base
                  </button>
                )}
              </div>
            </div>
            {loading && safeEvents.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading events...</div>
            ) : filteredTimelineEvents.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">{timelineEmptyMessage}</div>
            ) : (
              <div className="space-y-3">
                {filteredTimelineEvents.slice(0, 8).map((event) => (
                  <article key={event.id} className="sc-card-muted p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                          {formatEventType(event.type)}
                        </p>
                        <h3 className="text-lg font-semibold text-[var(--sc-ink)]">{event.name}</h3>
                        {event.location && (
                          <p className="text-xs text-[var(--sc-ink-muted)]">{event.location}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-[var(--sc-ink-muted)]">
                          {formatDateRange(event.start_date, event.end_date)}
                        </p>
                        <Link to={`/matches?eventId=${event.id}`} className="sc-button is-ghost mt-2 inline-flex text-xs">
                          View matches
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="sc-shell grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="space-y-6">
            <div className="sc-card-base space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="sc-chip">Matches</p>
                  <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Live & upcoming</h2>
                </div>
                <Link to="/matches" className="sc-button is-ghost">
                  All matches
                </Link>
              </div>
              {loading && liveAndUpcomingMatches.length === 0 ? (
                <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading matches...</div>
              ) : liveAndUpcomingMatches.length === 0 ? (
                <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                  No open matches right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {liveAndUpcomingMatches.map((match) => {
                    const live = isMatchLive(match.status);
                    const final = isMatchFinal(match.status);
                    const showScore = live || final;
                    return (
                      <article
                        key={match.id}
                        className="rounded-2xl border border-[var(--sc-border)]/80 bg-[rgba(10,29,24,0.9)] p-4"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                              {match.event?.name || match.venue?.name || "Match"}
                            </p>
                            <h3 className="text-lg font-semibold text-[var(--sc-ink)]">{formatMatchup(match)}</h3>
                            <p className="text-xs text-[var(--sc-ink-muted)]">{formatMatchMeta(match)}</p>
                          </div>
                          <div className="text-right">
                            {showScore ? (
                              <>
                                <p className="text-2xl font-semibold text-[var(--sc-accent)]">{formatLiveScore(match)}</p>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                                  {formatMatchStatus(match.status) || (live ? "Live" : "Final")}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                                {formatMatchStatus(match.status) || "Scheduled"}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link to={`/matches?matchId=${match.id}`} className="sc-button is-ghost text-xs">
                            {live ? "Live tracker" : "Details"}
                          </Link>
                          {matchHasStream(match) && (
                            <a href={resolveStreamUrl(match)} target="_blank" rel="noreferrer" className="sc-button is-ghost text-xs">
                              Watch
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sc-card-base space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="sc-chip">Finals</p>
                  <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Latest results</h2>
                </div>
                <Link to="/matches" className="sc-button is-ghost">
                  Match archive
                </Link>
              </div>
              {loading && latestResults.length === 0 ? (
                <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading results...</div>
              ) : latestResults.length === 0 ? (
                <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                  No finals saved yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {latestResults.map((match) => (
                    <Link
                      key={match.id}
                      to={`/matches?matchId=${match.id}`}
                      className="block rounded-2xl border border-[var(--sc-border)]/70 bg-[rgba(6,22,18,0.8)] p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                            {match.event?.name || "Match"}
                          </p>
                          <h3 className="text-lg font-semibold text-[var(--sc-ink)]">{formatMatchup(match)}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-[var(--sc-accent)]">{formatLiveScore(match)}</p>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sc-ink-muted)]">
                            {match.status || "final"}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="sc-card-base space-y-3 p-5 sm:p-6">
              <p className="sc-chip">Streaming</p>
              <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Featured broadcast</h2>
              {upcomingStreamMatch ? (
                <>
                  <p className="text-sm text-[var(--sc-ink)]">{formatMatchup(upcomingStreamMatch)}</p>
                  <p className="text-xs text-[var(--sc-ink-muted)]">{formatMatchTime(upcomingStreamMatch.start_time)}</p>
                  <p className="text-xs text-[var(--sc-ink-muted)]">
                    Provider: {formatMediaProvider(upcomingStreamMatch.media_provider)}
                  </p>
                  <a href={resolveStreamUrl(upcomingStreamMatch)} target="_blank" rel="noreferrer" className="sc-button mt-2">
                    Watch stream
                  </a>
                </>
              ) : (
                <p className="text-sm text-[var(--sc-ink-muted)]">Attach media links to highlight upcoming streams.</p>
              )}
            </div>
            <div className="sc-card-base space-y-3 p-5 sm:p-6">
              <p className="sc-chip">Spotlight</p>
              <h2 className="text-xl font-semibold text-[var(--sc-ink)]">Event focus</h2>
              {spotlightEvent ? (
                <>
                  <p className="text-lg font-semibold text-[var(--sc-ink)]">{spotlightEvent.name}</p>
                  <p className="text-sm text-[var(--sc-ink-muted)]">
                    {formatDateRange(spotlightEvent.start_date, spotlightEvent.end_date)}
                  </p>
                  <p className="text-sm text-[var(--sc-ink-muted)]">{spotlightEvent.location || "Location TBC"}</p>
                </>
              ) : (
                <p className="text-sm text-[var(--sc-ink-muted)]">Create events to spotlight a league, tournament, or camp.</p>
              )}
            </div>
          </div>
        </section>

        <section className="sc-shell grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="sc-card-base space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sc-chip">Divisions</p>
                <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Active standings</h2>
              </div>
              <Link to="/divisions" className="sc-button">
                View standings
              </Link>
            </div>
            {loading && safeDivisions.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">Loading divisions...</div>
            ) : safeDivisions.length === 0 ? (
              <div className="sc-card-muted p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                No divisions yet. Add one in the dashboard to see it here.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {safeDivisions.map((division) => (
                  <article key={division.id} className="sc-card-muted p-4">
                    <h3 className="text-lg font-semibold text-[var(--sc-ink)]">{division.name}</h3>
                    <p className="text-sm text-[var(--sc-ink-muted)]">
                      Level: {division.level ? division.level : "Not specified"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="sc-card-base space-y-4 border border-[var(--sc-border-strong)]/70 bg-[radial-gradient(circle_at_12%_20%,rgba(99,255,160,0.12),transparent_50%),radial-gradient(circle_at_82%_0%,rgba(103,233,193,0.18),transparent_40%),linear-gradient(150deg,rgba(12,33,27,0.9),rgba(6,22,18,0.95))] p-5 sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sc-chip">Teams</p>
                <h2 className="text-2xl font-semibold text-[var(--sc-ink)]">Programs to watch</h2>
                <p className="text-sm text-[var(--sc-ink-muted)]">
                  Handpicked programs showcasing league talent and operational excellence.
                </p>
              </div>
              <Link to="/teams" className="sc-button">
                View all
              </Link>
            </div>
            {loading && featuredTeams.length === 0 ? (
              <div className="rounded-2xl border border-[var(--sc-border)] bg-[rgba(6,22,18,0.7)] p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                Loading teams...
              </div>
            ) : featuredTeams.length === 0 ? (
              <div className="rounded-2xl border border-[var(--sc-border)] bg-[rgba(6,22,18,0.7)] p-5 text-center text-sm text-[var(--sc-ink-muted)]">
                No teams found. Add a team to start the list.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {featuredTeams.slice(0, 4).map((team) => (
                  <Link
                    key={team.id}
                    to={`/teams/${team.id}`}
                    className="rounded-2xl border border-[var(--sc-border)]/80 bg-[rgba(10,29,24,0.85)] p-4 shadow-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--sc-accent)] shadow-[0_0_0_6px_rgba(198,255,98,0.12)]" />
                      <h3 className="text-xl font-semibold text-[var(--sc-ink)]">{team.name}</h3>
                    </div>
                    {team.short_name && (
                      <p className="mt-2 text-sm text-[var(--sc-ink-muted)]">Short name: {team.short_name}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="sc-shell mt-10">
        <div className="sc-card-muted flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-[var(--sc-ink)]">
            &copy; {new Date().getFullYear()} StallCount. Built for Ultimate event control rooms.
          </p>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <Link to="/matches" className="font-semibold text-[var(--sc-accent)]">
              Matches
            </Link>
            <Link to="/teams" className="font-semibold text-[var(--sc-accent)]">
              Teams
            </Link>
            <Link to="/players" className="font-semibold text-[var(--sc-accent)]">
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
  })}`;
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

function formatMediaProvider(provider) {
  const normalized = typeof provider === "string" ? provider.replace(/_/g, " ").trim() : "";
  if (!normalized) return "Custom";
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  const statusLabel = formatMatchStatus(match?.status);
  if (statusLabel) {
    parts.push(statusLabel);
  }
  return parts.join(" | ") || "Details pending";
}

function formatMatchVenue(match) {
  if (match.venue?.name) return match.venue.name;
  if (match.event?.name) return match.event.name;
  return match.start_time ? formatMatchTime(match.start_time) : "Venue TBD";
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

function describeSubscriptionTarget(sub, teamLookup, matchLookup) {
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
    return `Player ${id.slice(0, 4)}`;
  }
  if (type === "event") {
    return `Event ${id.slice(0, 4)}`;
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
  if (type === "division") return "/divisions";
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
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

function pickSpotlightEvent(filteredEvents, allEvents) {
  if (filteredEvents && filteredEvents.length > 0) {
    return filteredEvents[0];
  }
  return allEvents?.[0] || null;
}

function deriveTaskList(matches = []) {
  const tasks = [];
  const missingScorekeeper = matches.filter((match) => !match?.scorekeeper).length;
  if (missingScorekeeper > 0) {
    tasks.push({
      id: "scorekeeper",
      label: `${missingScorekeeper} match${missingScorekeeper === 1 ? "" : "es"} missing scorekeeper`,
      href: "/scorekeeper",
      cta: "Assign",
    });
  }
  const missingStart = matches.filter((match) => !match?.start_time).length;
  if (missingStart > 0) {
    tasks.push({
      id: "start-time",
      label: `${missingStart} match${missingStart === 1 ? "" : "es"} missing a start time`,
      href: "/matches",
      cta: "Schedule",
    });
  }
  const ready = matches.filter((match) => (match.status || "").toLowerCase() === "ready").length;
  if (ready > 0) {
    tasks.push({
      id: "ready",
      label: `${ready} match${ready === 1 ? "" : "es"} ready to score`,
      href: "/scorekeeper",
      cta: "Open",
    });
  }
  return tasks;
}

function filterTimelineEvents(events = [], options = {}) {
  const now = Date.now();
  return events
    .filter((event) => {
      if (options.type && options.type !== "all") {
        return (event.type || "").toLowerCase() === options.type;
      }
      return true;
    })
    .filter((event) => matchesScope(event, options.scope || "current", now))
    .filter((event) => {
      if (!options.nearMeOnly) return true;
      if (!options.homeBase) return false;
      return matchesLocation(event.location, options.homeBase);
    })
    .sort((a, b) => {
      const aTime = a.start_date ? new Date(a.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.start_date ? new Date(b.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}

function matchesScope(event, scope, now) {
  const start = event.start_date ? new Date(event.start_date).getTime() : null;
  const end = event.end_date ? new Date(event.end_date).getTime() : start;
  if (scope === "current") {
    if (start && end) return start <= now && now <= end;
    if (start) return Math.abs(now - start) < 7 * 24 * 60 * 60 * 1000;
    return true;
  }
  if (scope === "upcoming") {
    return !start || start >= now;
  }
  if (scope === "completed") {
    if (!end) return false;
    return end < now;
  }
  return true;
}

function matchesLocation(location, homeBase) {
  if (!location || !homeBase) return false;
  return location.toLowerCase().includes(homeBase.toLowerCase());
}

function formatTimelineScopeLabel(scope) {
  switch (scope) {
    case "current":
      return "Current season timeline";
    case "upcoming":
      return "Upcoming schedule";
    case "completed":
      return "Final results";
    default:
      return "All events";
  }
}

function formatEventType(type) {
  if (!type) return "Event";
  return type.charAt(0).toUpperCase() + type.slice(1);
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

function readStoredHomeBase() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("sc_home_base") || "";
  } catch (err) {
    console.warn("[HomePage] Unable to read home base:", err);
    return "";
  }
}

function writeStoredHomeBase(value) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem("sc_home_base", value);
    } else {
      window.localStorage.removeItem("sc_home_base");
    }
  } catch (err) {
    console.warn("[HomePage] Unable to persist home base:", err);
  }
}
