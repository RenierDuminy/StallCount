import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Panel, SectionHeader, SectionShell } from "../components/ui/primitives";
import { getHomeBelowFoldSummary, getHomeHeroSummary } from "../services/homeSummaryService";
import { getEventsList } from "../services/leagueService";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

const PLATFORM_ICONS = {
  web:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  facebook:  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>,
  instagram: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>,
  youtube:   <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white"/></svg>,
  x:         <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.845L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  email:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
};

function SocialLink({ href, label, platform = "web" }) {
  return (
    <a href={href} target={href.startsWith("mailto") ? undefined : "_blank"} rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#e8f0e9] px-2.5 py-1.5 text-xs font-semibold text-[#2d7a4f] hover:bg-[#d6e8d9] transition-colors">
      {PLATFORM_ICONS[platform]}
      {label}
    </a>
  );
}

function formatDate(value) {
  if (!value) return null;
  try {
    return DATE_FORMATTER.format(new Date(value));
  } catch {
    return null;
  }
}

function toSettled(promise) {
  return promise
    .then((value) => ({ status: "fulfilled", value }))
    .catch(() => ({ status: "rejected" }));
}

function getFulfilled(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

export default function CommunityPage() {
  const [heroData, setHeroData] = useState(null);
  const [belowFoldData, setBelowFoldData] = useState(null);
const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      const [hero, below, events] = await Promise.all([
        toSettled(getHomeHeroSummary()),
        toSettled(getHomeBelowFoldSummary()),
        toSettled(getEventsList(6)),
      ]);

      if (!ignore) {
        setHeroData(getFulfilled(hero, null));
        setBelowFoldData(getFulfilled(below, null));
        setUpcomingEvents(getFulfilled(events, []));
        setLoading(false);
      }
    }

    load();
    return () => { ignore = true; };
  }, []);

  const stats = belowFoldData?.stats ?? null;
  const liveMatchCount = heroData?.openMatches?.filter((m) => m.status === "live" || m.status === "halftime").length ?? 0;
  const upcomingMatchCount = heroData?.openMatches?.filter((m) => m.status !== "live" && m.status !== "halftime").length ?? 0;
  const sortedEvents = useMemo(() => {
    return [...upcomingEvents]
      .filter((e) => e.status !== "archived")
      .sort((a, b) => {
        const aDate = a.start_date ? new Date(a.start_date).getTime() : Infinity;
        const bDate = b.start_date ? new Date(b.start_date).getTime() : Infinity;
        return aDate - bDate;
      })
      .slice(0, 5);
  }, [upcomingEvents]);

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="space-y-4 py-4 sm:space-y-6 sm:py-5">

        {/* Scrimmage — primary action */}
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="space-y-3">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-accent">Scrimmage</p>
              <h2 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">Run a pickup game,<br className="hidden sm:block" /> right now.</h2>
              <p className="max-w-prose text-sm text-ink-muted">No event setup, no database — just pick your rosters, configure the rules, and go. Track scores, manage timeouts, and log every point in real time. Works offline on the field and generates a full match report when you're done.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {["Live scoreboard", "Offline-ready", "PDF & CSV export", "ABBA tracking", "Spirit scores"].map((tag) => (
                  <span key={tag} className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-ink-muted">{tag}</span>
                ))}
              </div>
            </div>
            <Link to="/admin/scrimmage" className="sc-button shrink-0 self-start whitespace-nowrap sm:self-auto">
              Open scrimmage console
            </Link>
          </div>
        </Card>

        {/* Live activity strip */}
        {!loading && (liveMatchCount > 0 || upcomingMatchCount > 0 || stats) && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {liveMatchCount > 0 && (
              <Link to="/matches">
                <Panel variant="muted" className="flex h-full flex-col gap-1 p-3 transition hover:bg-surface-muted/80 sm:p-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Live now</p>
                  </div>
                  <p className="text-2xl font-semibold text-ink">{liveMatchCount}</p>
                  <p className="text-xs text-ink-muted">match{liveMatchCount !== 1 ? "es" : ""} in progress</p>
                </Panel>
              </Link>
            )}
            {upcomingMatchCount > 0 && (
              <Link to="/matches">
                <Panel variant="muted" className="flex h-full flex-col gap-1 p-3 transition hover:bg-surface-muted/80 sm:p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Upcoming</p>
                  <p className="text-2xl font-semibold text-ink">{upcomingMatchCount}</p>
                  <p className="text-xs text-ink-muted">scheduled match{upcomingMatchCount !== 1 ? "es" : ""}</p>
                </Panel>
              </Link>
            )}
            {stats?.teams > 0 && (
              <Link to="/teams">
                <Panel variant="muted" className="flex h-full flex-col gap-1 p-3 transition hover:bg-surface-muted/80 sm:p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Teams</p>
                  <p className="text-2xl font-semibold text-ink">{stats.teams}</p>
                  <p className="text-xs text-ink-muted">registered</p>
                </Panel>
              </Link>
            )}
            {stats?.players > 0 && (
              <Link to="/players">
                <Panel variant="muted" className="flex h-full flex-col gap-1 p-3 transition hover:bg-surface-muted/80 sm:p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Players</p>
                  <p className="text-2xl font-semibold text-ink">{stats.players}</p>
                  <p className="text-xs text-ink-muted">in directory</p>
                </Panel>
              </Link>
            )}
          </div>
        )}

        {/* Upcoming events */}
        <Card className="space-y-3 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <SectionHeader title="Upcoming events" />
            <Link to="/events" className="shrink-0 text-xs font-semibold text-ink-muted underline decoration-dotted underline-offset-4 transition hover:text-ink">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Panel key={i} variant="muted" className="animate-pulse p-3">
                  <div className="h-3.5 w-2/3 rounded-full bg-white/10" />
                  <div className="mt-1.5 h-3 w-1/3 rounded-full bg-white/6" />
                </Panel>
              ))}
            </div>
          ) : sortedEvents.length === 0 ? (
            <p className="text-sm text-ink-muted">No upcoming events.</p>
          ) : (
            <div className="divide-y divide-border">
              {sortedEvents.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className="flex items-start justify-between gap-3 py-2.5 transition hover:text-accent first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{event.name}</p>
                    {event.location && (
                      <p className="truncate text-xs text-ink-muted">{event.location}</p>
                    )}
                  </div>
                  {event.start_date && (
                    <p className="shrink-0 text-xs text-ink-muted">{formatDate(event.start_date)}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Community resources */}
        <div className="space-y-3">

          {/* Who runs the sport */}
          <div className="overflow-hidden rounded-2xl border border-[#dde8de] bg-white shadow-sm">
            <div className="border-b border-[#dde8de] bg-[#1a2e22] px-5 py-4 sm:px-8 sm:py-5">
              <h2 className="text-xl font-bold text-white sm:text-2xl">Who runs the sport</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/60">Ultimate in South Africa sits under three tiers of governance, from the global rulebody down to the national association that organises Nationals and the national teams.</p>
            </div>
            <div className="divide-y divide-[#eef2ee]">
              {[
                { badge: "WORLD", name: "World Flying Disc Federation (WFDF)", desc: "The international governing body. It owns the official Rules of Ultimate that every SA game follows, plus the free online accreditation test.", links: [{ label: "wfdf.sport", href: "https://wfdf.sport", p: "web" }, { label: "Rules", href: "https://rules.wfdf.sport", p: "web" }, { label: "SA member page", href: "https://wfdf.sport/members/rsa/", p: "web" }] },
                { badge: "AFRICA", name: "All Africa Flying Disc Federation (AAFDF)", desc: "The continental body recognised by WFDF, governing flying disc sports across Africa and running the All-Africa Ultimate Club Championships (AAUC).", links: [{ label: "Facebook", href: "https://www.facebook.com/AllAfricaFlyingDisc/", p: "facebook" }] },
                { badge: "SOUTH AFRICA", name: "South African Flying Disc Association (SAFDA)", desc: "The national governing body — it develops the sport, runs Nationals and Regionals, and selects the national teams that represent South Africa abroad.", links: [{ label: "safda.org.za", href: "https://safda.org.za", p: "web" }, { label: "@zaultimate_", href: "https://www.instagram.com/zaultimate_/", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/southafricanultimate/", p: "facebook" }, { label: "YouTube", href: "https://www.youtube.com/@safda_official", p: "youtube" }, { label: "Email exec", href: "mailto:safda-exec@googlegroups.com", p: "email" }] },
              ].map((org) => (
                <div key={org.name} className="px-5 py-4 sm:px-8 sm:py-5">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="shrink-0 rounded-md bg-[#e8f0e9] px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[#3a6647]">{org.badge}</span>
                    <p className="font-semibold text-[#1a2e22]">{org.name}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-[#4a6050] mb-2.5">{org.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {org.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clubs & where to play */}
          <div className="overflow-hidden rounded-2xl border border-[#dde8de] bg-white shadow-sm">
            <div className="border-b border-[#dde8de] bg-[#f0f5f1] px-5 py-4 sm:px-8 sm:py-5">
              <h2 className="text-xl font-bold text-[#1a2e22] sm:text-2xl">Clubs &amp; where to play</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#4a6050]">SAFDA divides the country into four regions — each runs its own tournaments that feed into Nationals. Most clubs welcome beginners at pickup before you commit to a team. For the full list, see <a href="https://safda.org.za/new-clubs/" target="_blank" rel="noreferrer" className="font-semibold text-[#2d7a4f] underline underline-offset-2 hover:no-underline">SAFDA's clubs page</a>.</p>
            </div>
            <div className="divide-y divide-[#eef2ee]">
              {[
                {
                  label: "Western", tag: "CTFDA",
                  desc: "Western Cape & Northern Cape. One of the oldest and deepest scenes, centred on Cape Town and Stellenbosch.",
                  clubs: [["UCT Flying Tigers / Roaring Tigers", "UCT, Cape Town"], ["Chilli Ultimate", "Pinelands, Cape Town"], ["Catch 22", "Cape Town"], ["Ghost Ultimate Club", "Cape Town"], ["Salusa 45", "Cape Town"], ["Maties Ultimate", "Stellenbosch"]],
                  links: [{ label: "capetownultimate.co.za", href: "https://www.capetownultimate.co.za/", p: "web" }, { label: "Facebook", href: "https://www.facebook.com/capetownultimate/", p: "facebook" }, { label: "Pickup games", href: "https://pickupultimate.com/map/city/capetown", p: "web" }],
                },
                {
                  label: "Northern", tag: "GFDA",
                  desc: "Gauteng, Free State, Mpumalanga, North West & Limpopo. The largest and busiest region, centred on Johannesburg and Pretoria.",
                  clubs: [["Ultitude", "Greenside, Jhb"], ["Skyveld", "Johannesburg"], ["Zone Rangers / Rex", "Jhb & Pretoria"], ["Wits Voodoo Kudus", "Wits, Jhb"], ["Soweto Ultimate", "Soweto"], ["Orange Farm", "Johannesburg"], ["Disks of Hazard", "Tuks, Pretoria"], ["Labradors", "Pretoria"], ["Elevation", "Potchefstroom"]],
                  links: [{ label: "Gauteng Ultimate (GFDA)", href: "https://www.facebook.com/GautengUltimate/", p: "facebook" }, { label: "Ultitude blog", href: "https://ultitudeclub.wordpress.com/", p: "web" }, { label: "Wits Ultimate", href: "https://www.wits.ac.za/sport/clubs/ultimate-frisbee/", p: "web" }, { label: "Pickup games", href: "https://pickupultimate.com/map/city/johannesburg", p: "web" }],
                },
                {
                  label: "KwaZulu-Natal", tag: "KZN",
                  desc: "Durban, Pietermaritzburg and the Midlands, with several long-standing competitive clubs.",
                  clubs: [["Long Donkeys", "Pietermaritzburg"], ["Bunnies", "Durban"], ["4th Prime", "Howick"], ["Rambs", "KZN"]],
                  links: [{ label: "Durban Ultimate", href: "https://www.facebook.com/DurbanUltimate/", p: "facebook" }, { label: "Long Donkeys", href: "https://www.facebook.com/LongDonkeys/", p: "facebook" }],
                },
                {
                  label: "Eastern Cape", tag: "EC",
                  desc: "Gqeberha, East London and surrounds — a developing region with a growing set of teams.",
                  clubs: [["Gale Force", "Gqeberha"], ["Hammerheads", "East London"], ["Rebels", "East London"]],
                  links: [],
                },
              ].map((group) => (
                <div key={group.tag}>
                  <div className="bg-[#f7f9f7] px-5 py-3 sm:px-8">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-bold text-[#1a2e22]">{group.label}</span>
                      <span className="font-mono text-[10px] font-bold tracking-wider text-[#2d7a4f] shrink-0">{group.tag}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#7c9e8a]">{group.desc}</p>
                  </div>
                  <div className="divide-y divide-[#f3f7f3] px-5 sm:px-8">
                    {group.clubs.map(([name, where]) => (
                      <div key={name} className="flex items-baseline justify-between gap-4 py-2.5">
                        <span className="text-sm text-[#1a2e22]">{name}</span>
                        {where && <span className="text-xs text-[#7c9e8a] shrink-0">{where}</span>}
                      </div>
                    ))}
                  </div>
                  {group.links.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-t border-[#eef2ee] bg-[#f7f9f7] px-5 py-3 sm:px-8">
                      {group.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rules & accreditation */}
          <div className="overflow-hidden rounded-2xl border border-[#dde8de] bg-white shadow-sm">
            <div className="border-b border-[#dde8de] bg-[#f0f5f1] px-5 py-4 sm:px-8 sm:py-5">
              <h2 className="text-xl font-bold text-[#1a2e22] sm:text-2xl">Rules &amp; accreditation</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#4a6050]">Ultimate is self-officiated: there are no referees, and players call their own fouls under Spirit of the Game. Knowing the rules — and the hand signals — is part of playing.</p>
            </div>
            <div className="divide-y divide-[#eef2ee]">
              {[
                { title: "WFDF Rules of Ultimate", desc: "The current official rulebook (2025–2028 cycle) plus its appendix. Read or download the latest version before competitive play.", link: { label: "rules.wfdf.sport", href: "https://rules.wfdf.sport" } },
                { title: "Rules accreditation test", desc: "Free online test with Standard and Advanced levels, unlimited attempts. Many leagues require it — go Advanced if you're past beginner.", link: { label: "Take the test", href: "https://rules.wfdf.sport/accreditation" } },
              ].map((card) => (
                <div key={card.title} className="flex items-start justify-between gap-4 px-5 py-4 sm:px-8 sm:py-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1a2e22]">{card.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#4a6050]">{card.desc}</p>
                  </div>
                  <a href={card.link.href} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-[#e8f0e9] px-3 py-2 text-sm font-bold text-[#2d7a4f] hover:bg-[#d6e8d9] transition-colors whitespace-nowrap">{card.link.label}</a>
                </div>
              ))}
              <div className="px-5 py-4 sm:px-8 sm:py-5 bg-[#1a2e22]">
                <p className="text-sm leading-relaxed text-white/70"><span className="font-bold text-white">Spirit of the Game. </span>Competitive play is encouraged, but never at the expense of mutual respect, the rules, or the basic joy of throwing a disc. It's the foundation every game here is built on.</p>
              </div>
            </div>
          </div>

          {/* Season & major events */}
          <div className="overflow-hidden rounded-2xl border border-[#dde8de] bg-white shadow-sm">
            <div className="border-b border-[#dde8de] bg-[#f0f5f1] px-5 py-4 sm:px-8 sm:py-5">
              <h2 className="text-xl font-bold text-[#1a2e22] sm:text-2xl">The season &amp; major events</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#4a6050]">The competitive year splits into two halves. Regional tournaments qualify teams for Nationals. Exact dates and venues change each year — check <a href="https://safda.org.za/new-safda-events/" target="_blank" rel="noreferrer" className="font-semibold text-[#2d7a4f] underline underline-offset-2 hover:no-underline">SAFDA's events page</a> for the current calendar.</p>
            </div>
            <div className="divide-y divide-[#eef2ee]">
              {[
                { when: "H1", name: "Mixed Nationals", desc: "The flagship mixed-division championship, hosted in the first half of the year. Regionals feed into it." },
                { when: "H2", name: "Open & Women's Nationals", desc: "Single-gender national championships in the second half of the year." },
                { when: "Pre-Nats", name: "Regionals", desc: "Northern, Western, KZN and Eastern Cape qualifiers that decide who advances to Nationals." },
                { when: "Oct", name: "Rocktober", desc: "Gauteng-hosted, often the biggest tournament of the year — high-intensity but social, and a draw for international teams." },
                { when: "Feb", name: "Swinburne Hat", desc: "A relaxed, mixed-up \"hat\" weekend near Harrismith where you're drafted onto a random team. Great first tournament." },
                { when: "Varies", name: "Inter-University Tournament", desc: "Student-only competition for university teams across the country." },
                { when: "Varies", name: "U24 Inter-Regional Tournament", desc: "Regional sides compete to shape national-team selection for World Championships." },
                { when: "Varies", name: "All-Africa Club Championships", desc: "The WFDF-sanctioned continental club event — SA clubs regularly travel and compete." },
              ].map((row) => (
                <div key={row.name} className="flex gap-4 px-5 py-4 sm:px-8">
                  <span className="font-mono text-xs font-bold text-[#2d7a4f] shrink-0 w-14 pt-0.5">{row.when}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1a2e22]">{row.name}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-[#4a6050]">{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* New here? Start throwing */}
          <div className="overflow-hidden rounded-2xl border border-[#dde8de] bg-white shadow-sm">
            <div className="border-b border-[#dde8de] bg-[#f0f5f1] px-5 py-4 sm:px-8 sm:py-5">
              <h2 className="text-xl font-bold text-[#1a2e22] sm:text-2xl">New here? Start throwing</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#4a6050]">You don't need a team or experience to start. Most clubs run weekly pickup that's free or cheap and beginner-friendly — just show up.</p>
            </div>
            <div className="divide-y divide-[#eef2ee] sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {[
                { title: "Find a pickup game", desc: "Browse casual games by city and day of the week, with field locations and WhatsApp links.", links: [{ label: "pickupultimate.com", href: "https://pickupultimate.com", p: "web" }] },
                { title: "Get a disc", desc: "Ultimate uses a 175 g disc. Grab one from a club merch table or an online supplier before your first session.", links: [{ label: "ARIA Discs", href: "https://ariadiscs.com", p: "web" }] },
                { title: "Register to compete", desc: "League and tournament play needs annual club membership (valid to 31 Dec). Your regional body handles sign-up.", links: [{ label: "Western (CTFDA)", href: "https://www.capetownultimate.co.za/", p: "web" }, { label: "Northern (GFDA)", href: "https://www.facebook.com/GautengUltimate/", p: "facebook" }] },
                { title: "Stay in the loop", desc: "The national mailing list and socials carry tournament announcements and the season calendar.", links: [{ label: "@zaultimate_", href: "https://www.instagram.com/zaultimate_/", p: "instagram" }, { label: "SAFDA email", href: "mailto:safda-exec@googlegroups.com", p: "email" }] },
              ].map((card) => (
                <div key={card.title} className="px-5 py-4 sm:px-8 sm:py-5">
                  <p className="font-semibold text-[#1a2e22] mb-1">{card.title}</p>
                  <p className="text-sm leading-relaxed text-[#4a6050] mb-3">{card.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {card.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p ?? "web"} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Follow & watch */}
          <div className="overflow-hidden rounded-2xl border border-[#dde8de] bg-white shadow-sm">
            <div className="border-b border-[#dde8de] bg-[#f0f5f1] px-5 py-4 sm:px-8 sm:py-5">
              <h2 className="text-xl font-bold text-[#1a2e22] sm:text-2xl">Follow &amp; watch</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#4a6050]">SA ultimate clubs and national bodies on social media, plus where to stream the international game.</p>
            </div>
            <div className="divide-y divide-[#eef2ee]">

              {/* SA accounts */}
              <div className="px-5 py-4 sm:px-8 sm:py-5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#7c9e8a] mb-3">South African accounts</p>
                <div className="space-y-3">
                  {[
                    { name: "SAFDA — South Africa", links: [{ label: "@zaultimate_", href: "https://www.instagram.com/zaultimate_/", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/southafricanultimate/", p: "facebook" }, { label: "YouTube", href: "https://www.youtube.com/@safda_official", p: "youtube" }] },
                    { name: "RSA Wild Dogs (U24 national team)", links: [{ label: "@rsawilddogs", href: "https://www.instagram.com/rsawilddogs/", p: "instagram" }] },
                    { name: "Cape Town Ultimate (CTFDA)", links: [{ label: "Facebook", href: "https://www.facebook.com/capetownultimate/", p: "facebook" }, { label: "YouTube", href: "https://www.youtube.com/@ctfda", p: "youtube" }] },
                    { name: "UCT Ultimate / Flying Tigers", links: [{ label: "@uct_ultimate", href: "https://www.instagram.com/uct_ultimate/", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/UCTUltimate", p: "facebook" }, { label: "X", href: "https://x.com/uctultimate", p: "x" }] },
                    { name: "Maties Ultimate (Stellenbosch)", links: [{ label: "@maties.ultimate", href: "https://www.instagram.com/maties.ultimate", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/matiesultimateclub/", p: "facebook" }, { label: "YouTube", href: "https://www.youtube.com/@matiesultimate", p: "youtube" }] },
                    { name: "Kaalvoet Kaos", links: [{ label: "YouTube", href: "https://www.youtube.com/@KaalvoetKaosUltimateFrisbee", p: "youtube" }] },
                    { name: "Chilli Ultimate", links: [{ label: "Facebook", href: "https://www.facebook.com/chilliultimate", p: "facebook" }] },
                    { name: "Gauteng Ultimate (GFDA)", links: [{ label: "Facebook", href: "https://www.facebook.com/GautengUltimate/", p: "facebook" }] },
                    { name: "Long Donkeys (PMB)", links: [{ label: "Facebook", href: "https://www.facebook.com/LongDonkeys/", p: "facebook" }] },
                    { name: "Durban Ultimate / Bunnies", links: [{ label: "Facebook", href: "https://www.facebook.com/DurbanUltimate/", p: "facebook" }] },
                  ].map((row) => (
                    <div key={row.name} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="text-sm font-medium text-[#1a2e22] min-w-[160px]">{row.name}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {row.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* International streaming */}
              <div className="px-5 py-4 sm:px-8 sm:py-5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#7c9e8a] mb-3">International streaming</p>
                <div className="space-y-3">
                  {[
                    { name: "Ultiworld", desc: "The premier ultimate media outlet — subscription streaming of major events, free highlights and a weekly show.", links: [{ label: "ultiworld.com", href: "https://ultiworld.com", p: "web" }, { label: "YouTube", href: "https://www.youtube.com/user/ultiworld", p: "youtube" }] },
                    { name: "WatchUFA (Ultimate Frisbee Association)", desc: "Every pro UFA game streamed live; one free game a week on YouTube as Friday Night Frisbee.", links: [{ label: "watchufa.com", href: "https://watchufa.com", p: "web" }, { label: "YouTube", href: "https://www.youtube.com/channel/UCzInURHrtSH7208Mf1HVqUA", p: "youtube" }] },
                    { name: "ulti.TV", desc: "YouTube channel dedicated to ultimate — live matches and broader community coverage.", links: [{ label: "YouTube", href: "https://www.youtube.com/@ULTIdotTV", p: "youtube" }] },
                  ].map((row) => (
                    <div key={row.name}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-0.5">
                        <span className="text-sm font-semibold text-[#1a2e22]">{row.name}</span>
                        {row.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                      </div>
                      <p className="text-xs leading-relaxed text-[#7c9e8a]">{row.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

        </div>

      </SectionShell>
    </div>
  );
}
