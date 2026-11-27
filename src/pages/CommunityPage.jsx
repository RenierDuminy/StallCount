import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, SectionShell } from "../components/ui/primitives";

// A plain reference page: headings, paragraphs, row lists and underlined text
// links, laid out like a traditional article with a contents list beside it.
// Secondary text uses text-ink/75 rather than text-ink-muted, which reads
// poorly on the dark surfaces.

const SECTIONS = [
  { id: "governance", title: "Who runs the sport" },
  { id: "clubs", title: "Clubs and where to play" },
  { id: "rules", title: "Rules and accreditation" },
  { id: "season", title: "The season" },
  { id: "start", title: "Getting started" },
  { id: "follow", title: "Follow and watch" },
];

const ORGANISATIONS = [
  {
    name: "World Flying Disc Federation (WFDF)",
    desc: "The international governing body. It publishes the official Rules of Ultimate that South African games follow, and the rules accreditation.",
    links: [
      { label: "wfdf.sport", href: "https://wfdf.sport" },
      { label: "Rules of Ultimate", href: "https://rules.wfdf.sport" },
      { label: "South Africa member page", href: "https://wfdf.sport/members/rsa/" },
    ],
  },
  {
    name: "All Africa Flying Disc Federation (AAFDF)",
    desc: "The continental federation recognised by WFDF, made up of 25 member countries. It co-organises the WFDF All Africa Ultimate Championships with WFDF.",
    links: [{ label: "africa.wfdf.sport", href: "https://africa.wfdf.sport/events" }],
  },
  {
    name: "South African Flying Disc Association (SAFDA)",
    desc: "The national governing body. It runs the national championships and the national teams (Wild Dogs, Honey Badgers, Mambas and Bafazi). Its website is not always up to date, so check the regional bodies and the social accounts below for current news.",
    links: [
      { label: "safda.org.za", href: "https://safda.org.za" },
      { label: "Facebook", href: "https://www.facebook.com/southafricanultimate/" },
      { label: "YouTube", href: "https://www.youtube.com/channel/UCjKzaG2IWEyJDxR3j1aWd0g" },
    ],
  },
];

// Only clubs with 2025 or 2026 evidence on a source other than the SAFDA site.
const REGIONS = [
  {
    name: "Western Cape",
    body: "CTFDA",
    desc: "The Cape Town Flying Disc Association runs two league seasons: open and women's in the first half of the year, mixed in the second. Weekly fixtures are on Monday evenings or Saturday mornings at Stellenbosch University, UCT and the Pinelands cricket ovals.",
    clubs: [
      ["Chilli Ultimate", "Pinelands, Cape Town. Mixed teams Chilli Heat and Chilli Legends, women's team Hot Sauce"],
      ["Ghost Ultimate", "Cape Town. Mixed"],
      ["Maties Ultimate", "Stellenbosch. Mixed (Meerkats, Mountain Leopards), open (Ma’Gents) and women's (Ma’Ladies)"],
      ["Nomad Ultimate", "Cape Town. Mixed"],
      ["Northern Lights Ultimate", "Northern suburbs, Cape Town. Mixed"],
      ["UCT Ultimate", "University of Cape Town. Mixed (Flying Tigers, Roaring Tigers), open (ManCubs) and women's (BenGals)"],
      ["Mutiny, Gradient and Zephyr", "Cape Town. Open"],
      ["Craft", "Cape Town. Women's"],
    ],
    links: [
      { label: "capetownultimate.co.za", href: "https://www.capetownultimate.co.za/league/clubs" },
      { label: "Facebook", href: "https://www.facebook.com/capetownultimate/" },
      { label: "Instagram", href: "https://www.instagram.com/capetownultimate/" },
    ],
  },
  {
    name: "Gauteng",
    body: "GFDA",
    desc: "The Gauteng Flying Disc Association (also trading as Gauteng Ultimate) runs the region's tournaments, including Rocktober, and a Saturday morning pickup in Johannesburg.",
    clubs: [
      ["Wits Ultimate", "Wits University, Johannesburg. Trains Monday and Thursday evenings on Bozzoli B field"],
      ["Ultitude", "Johannesburg. Runs weekly pickup games"],
      ["Vaaltimate", "Vanderbijlpark. Runs weekly pickup games"],
    ],
    links: [
      { label: "Wits Ultimate", href: "https://www.wits.ac.za/sport/clubs/ultimate-frisbee/" },
      { label: "Gauteng Ultimate on Instagram", href: "https://www.instagram.com/gauteng_ultimate/" },
      { label: "Ultitude on Instagram", href: "https://www.instagram.com/ultitude.jhb/" },
    ],
  },
];

const SEASON = [
  { name: "Swinburne Hat", when: "February", desc: "A casual weekend hat tournament at Swinburne, just past Harrismith, where players are put on random teams. A good first tournament." },
  { name: "Cape Town open and women's league", when: "February to April", desc: "A draft league in February and March, then the competitive league in March and April." },
  { name: "Regionals", when: "March and April", desc: "Open and women's regional qualifiers that lead into Nationals." },
  { name: "Open and Women's Nationals", when: "April and May", desc: "The national championships for the open and women's divisions." },
  { name: "Cape Town mixed league", when: "July to November", desc: "A draft league in July and August, then the mixed club league from August to November." },
  { name: "Rocktober", when: "October", desc: "Hosted in Gauteng by Gauteng Ultimate each year, with international teams joining. One of the biggest tournaments in the country." },
  { name: "Mixed Regionals and Mixed Nationals", when: "October and November", desc: "Mixed regional qualifiers followed by the national mixed championship. Nationals have been streamed on SAFDA’s YouTube channel." },
  { name: "Off-season events", when: "May to December", desc: "In Cape Town: UCT May Day (May), an indoor tournament at UCT (September and October) and a Masters League (November and December)." },
  { name: "WFDF All Africa Ultimate Championships", when: "October 2025", desc: "The continental mixed championship, played in Kampala, Uganda, with a South African team among 13 teams from nine countries." },
  { name: "SA Invite", when: "26 April to early May 2026", desc: "South Africa’s first international ultimate festival, held in Cape Town as a mixed tournament for teams from South Africa, Africa and abroad." },
];

const PICKUPS = [
  ["Cape Town", "Clifton 1st Beach", "Sundays, morning. Time and place confirmed weekly on WhatsApp"],
  ["Cape Town", "Rondebosch sports fields", "Sundays, 15:00. Family friendly"],
  ["Cape Town", "Northern suburbs (Northern Lights)", "Sundays, afternoon. Beginner friendly"],
  ["Cape Town", "Maties Women’s Pickup", "Fridays, 17:15. Beginner friendly"],
  ["Johannesburg", "Gauteng Ultimate, Marks Park", "Saturdays, 08:30 (09:00 in winter)"],
  ["Johannesburg", "Ultitude, Zoo Lake", "Tuesdays in the open and women's season (January to June); Wednesday evenings in the mixed season (July to December)"],
  ["Johannesburg", "Wits Ultimate, Bozzoli B field", "Fridays, 16:30 to 18:00"],
  ["Vanderbijlpark", "Vaaltimate", "Mondays and Thursdays, 16:30"],
];

const SA_ACCOUNTS = [
  { name: "SAFDA", links: [{ label: "Facebook", href: "https://www.facebook.com/southafricanultimate/" }, { label: "YouTube", href: "https://www.youtube.com/channel/UCjKzaG2IWEyJDxR3j1aWd0g" }] },
  { name: "RSA Wild Dogs (U24 national team)", links: [{ label: "Instagram", href: "https://www.instagram.com/rsawilddogs/" }] },
  { name: "Cape Town Ultimate (CTFDA)", links: [{ label: "Facebook", href: "https://www.facebook.com/capetownultimate/" }, { label: "Instagram", href: "https://www.instagram.com/capetownultimate/" }] },
  { name: "UCT Ultimate", links: [{ label: "Instagram", href: "https://www.instagram.com/uct_ultimate/" }] },
  { name: "Maties Ultimate", links: [{ label: "Club page", href: "https://www.capetownultimate.co.za/league/clubs/maties-ultimate" }] },
  { name: "Chilli Ultimate", links: [{ label: "Club page", href: "https://www.capetownultimate.co.za/league/clubs/chilli-ultimate" }] },
  { name: "Gauteng Ultimate (GFDA)", links: [{ label: "Instagram", href: "https://www.instagram.com/gauteng_ultimate/" }] },
  { name: "Ultitude", links: [{ label: "Instagram", href: "https://www.instagram.com/ultitude.jhb/" }] },
  { name: "Wits Ultimate", links: [{ label: "Instagram", href: "https://www.instagram.com/wits_ultimate/" }] },
];

const STREAMING = [
  { name: "Ultiworld", desc: "News, results and coverage of club and national championships.", links: [{ label: "ultiworld.com", href: "https://ultiworld.com" }] },
];

const LINK_CLASS = "font-semibold underline underline-offset-2 hover:no-underline";

function ExternalLink({ href, children }) {
  const isMail = href.startsWith("mailto:");
  return (
    <a
      href={href}
      className={LINK_CLASS}
      target={isMail ? undefined : "_blank"}
      rel={isMail ? undefined : "noreferrer"}
    >
      {children}
    </a>
  );
}

/** A wrapping row of links with room between them, so each is easy to tap. */
function LinkList({ links }) {
  if (!links?.length) return null;
  return (
    <span className="flex flex-wrap gap-x-5">
      {links.map((link) => (
        <span key={link.href} className="py-1.5">
          <ExternalLink href={link.href}>{link.label}</ExternalLink>
        </span>
      ))}
    </span>
  );
}

/**
 * Rows of label + detail. Stacked on a phone (label, small line, then text);
 * label in a left column from the sm breakpoint. Replaces wide tables.
 */
function RowList({ rows }) {
  return (
    <ul className="divide-y divide-white/15 border-y border-white/15">
      {rows.map((row) => (
        <li key={row.key ?? row.title} className="py-3 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-x-4">
          <p className="font-semibold text-ink">{row.title}</p>
          <div className="mt-1 sm:mt-0">
            {row.meta ? <p className="text-sm font-medium text-ink/75">{row.meta}</p> : null}
            {row.body ? <div className={row.meta ? "mt-0.5" : ""}>{row.body}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * A collapsible section. On a phone all but the first start closed, so the page
 * reads as a short list of headings; on desktop everything starts open. A link
 * to #id (the contents list) opens the section it points at.
 */
function Section({ id, title, blurb, defaultOpen = false, children }) {
  const [open, setOpen] = useState(
    () => defaultOpen || (typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches),
  );

  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [id]);

  return (
    <section id={id} className="scroll-mt-20 border-t border-white/20">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left"
        >
          <span>
            <span className="block text-xl font-bold text-ink sm:text-2xl">{title}</span>
            {blurb ? <span className="mt-0.5 block text-sm font-normal text-ink/75">{blurb}</span> : null}
          </span>
          <svg
            viewBox="0 0 20 20"
            className={`h-5 w-5 shrink-0 text-ink transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </h2>
      {open ? (
        <div id={`${id}-panel`} className="space-y-4 pb-6 text-base leading-relaxed text-ink/85">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function SubHeading({ children }) {
  return <h3 className="pt-2 text-lg font-semibold text-ink">{children}</h3>;
}

export default function CommunityPage() {
  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="py-6 sm:py-10">
        <header className="max-w-3xl">
          <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">Community</h1>
          <p className="mt-3 text-base leading-relaxed text-ink/85">
            A guide to ultimate in South Africa: who runs the sport, where to play, the rules, the season, and
            where to follow along.
          </p>
        </header>

        <Card as="section" aria-labelledby="scrimmage-heading" className="mt-8 max-w-3xl p-5 sm:p-6">
          <h2 id="scrimmage-heading" className="text-xl font-semibold text-ink">
            Scoring a pickup game
          </h2>
          <p className="mt-2 text-base leading-relaxed text-ink/85">
            Want match statistics for an unofficial match? StallCount&rsquo;s scrimmage console scores a game without any event setup. Enter the two rosters, set
            the rules, and track points, timeouts and halftime. It works offline on the field and produces a PDF
            match report and a match data file at the end.
          </p>
          <Link to="/admin/scrimmage" className="sc-button mt-4 inline-flex">
            Open the scrimmage console
          </Link>
        </Card>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,48rem)] lg:gap-12">
          <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <h2 className="text-sm font-semibold text-ink">On this page</h2>
            <ol className="mt-1 text-base lg:text-sm">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="block py-2 underline-offset-2 hover:underline lg:py-1">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 space-y-10 break-words">
            <Section id="governance" title="Who runs the sport" blurb="The world, continental and national bodies" defaultOpen>
              <p>
                Ultimate in South Africa sits under three levels of governance, from the world rules body down to
                the national association that runs Nationals and selects the national teams.
              </p>
              {ORGANISATIONS.map((org) => (
                <div key={org.name}>
                  <SubHeading>{org.name}</SubHeading>
                  <p className="mt-1">{org.desc}</p>
                  <p className="mt-1">
                    <LinkList links={org.links} />
                  </p>
                </div>
              ))}
            </Section>

            <Section id="clubs" title="Clubs and where to play" blurb="Active clubs in Cape Town and Gauteng">
              <p>
                These are the clubs with recent activity (2025 or 2026) confirmed outside SAFDA&rsquo;s own website,
                whose club list is out of date. Try a pickup game before you commit to a team.
              </p>
              {REGIONS.map((region) => (
                <div key={region.name}>
                  <SubHeading>
                    {region.name} <span className="font-normal text-ink/75">({region.body})</span>
                  </SubHeading>
                  <p className="mt-1">{region.desc}</p>
                  <div className="mt-3">
                    <RowList rows={region.clubs.map(([club, where]) => ({ title: club, body: where }))} />
                  </div>
                  {region.links.length ? (
                    <p className="mt-2">
                      <LinkList links={region.links} />
                    </p>
                  ) : null}
                </div>
              ))}
              <p>
                Ultimate has also been played in KwaZulu-Natal, the Eastern Cape and Pretoria, but no recent activity
                could be confirmed for those clubs, so they are not listed. If your club is active, let the
                StallCount team know and it will be added.
              </p>
            </Section>

            <Section id="rules" title="Rules and accreditation" blurb="The WFDF rulebook and how to get accredited">
              <p>
                Ultimate is self-officiated. There are no referees: players call their own fouls under the Spirit
                of the Game, so knowing the rules is part of playing.
              </p>
              <div>
                <SubHeading>WFDF Rules of Ultimate</SubHeading>
                <p className="mt-1">
                  The current official rulebook (2025–2028), in force since 1 January 2025, and its appendix, which
                  WFDF updated in July 2026. Read the latest version at{" "}
                  <ExternalLink href="https://rules.wfdf.sport">rules.wfdf.sport</ExternalLink>.
                </p>
              </div>
              <div>
                <SubHeading>Rules accreditation</SubHeading>
                <p className="mt-1">
                  A Standard and an Advanced level that show you have read and understood the rules. Since July 2026
                  accreditation is run on the WFDF Academy platform, and older certificates from rules.wfdf.sport
                  stay valid.{" "}
                  <ExternalLink href="https://wfdf.sport/2026/07/wfdf-launches-enhanced-ultimate-rules-accreditation-on-wfdf-academy-platform/">
                    Read the announcement
                  </ExternalLink>
                  .
                </p>
              </div>
              <blockquote className="border-l-2 border-white/40 pl-4">
                <p>
                  <strong className="text-ink">Spirit of the Game.</strong> Competitive play is encouraged, but never
                  at the expense of mutual respect, the rules, or the basic joy of play.
                </p>
              </blockquote>
            </Section>

            <Section id="season" title="The season" blurb="Leagues and tournaments through the year">
              <p>
                The competitive year has two halves: open and women&rsquo;s in the first half, mixed in the second,
                with regional tournaments qualifying teams for Nationals. Months below are the usual timing. Exact
                dates are confirmed closer to the time; the Cape Town calendar is on{" "}
                <ExternalLink href="https://www.capetownultimate.co.za/league/team-schedules">capetownultimate.co.za</ExternalLink>.
              </p>
              <RowList rows={SEASON.map((row) => ({ title: row.name, meta: row.when, body: row.desc }))} />
            </Section>

            <Section id="start" title="Getting started" blurb="Weekly pickup games and how to join">
              <p>
                You don&rsquo;t need a team or any experience. Clubs run weekly pickup games that welcome
                beginners, usually for a small fee or for free.
              </p>
              <div>
                <SubHeading>Find a pickup game</SubHeading>
                <p className="mt-1">
                  <ExternalLink href="https://pickupultimate.com">pickupultimate.com</ExternalLink> lists casual
                  games by city and day of the week, with field locations and group chat links.
                </p>
              </div>
              <RowList
                rows={PICKUPS.map(([city, game, when]) => ({ key: `${city}-${game}`, title: game, meta: city, body: when }))}
              />
              <p className="text-ink/75">
                Times change with the seasons, so confirm with the organiser first. The listings on{" "}
                <ExternalLink href="https://pickupultimate.com/cities/cape-town">Cape Town</ExternalLink> and{" "}
                <ExternalLink href="https://pickupultimate.com/cities/johannesburg">Johannesburg</ExternalLink> are
                kept current.
              </p>
              <div>
                <SubHeading>Get a disc</SubHeading>
                <p className="mt-1">Ultimate is played with a 175 g disc.</p>
              </div>
              <div>
                <SubHeading>Join a club or league</SubHeading>
                <p className="mt-1">
                  In Cape Town, new teams and players can contact the CTFDA at{" "}
                  <ExternalLink href="mailto:helloctfda@gmail.com">helloctfda@gmail.com</ExternalLink>. Wits
                  Ultimate takes students and alumni (membership R650 for students and R750 for alumni, at the time of
                  writing). Elsewhere, ask at a pickup game.
                </p>
              </div>
              <div>
                <SubHeading>Stay up to date</SubHeading>
                <p className="mt-1">
                  Tournament news goes out on{" "}
                  <ExternalLink href="https://www.facebook.com/southafricanultimate/">SAFDA&rsquo;s Facebook page</ExternalLink>
                  , and the Cape Town calendar is on{" "}
                  <ExternalLink href="https://www.capetownultimate.co.za/league/team-schedules">capetownultimate.co.za</ExternalLink>.
                </p>
              </div>
            </Section>

            <Section id="follow" title="Follow and watch" blurb="Social accounts and news">
              <SubHeading>South African accounts</SubHeading>
              <RowList rows={SA_ACCOUNTS.map((row) => ({ title: row.name, body: <LinkList links={row.links} /> }))} />

              <SubHeading>News and coverage</SubHeading>
              <ul className="space-y-3">
                {STREAMING.map((row) => (
                  <li key={row.name}>
                    <p>
                      <strong className="text-ink">{row.name}.</strong> {row.desc}
                    </p>
                    <p>
                      <LinkList links={row.links} />
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          </article>
        </div>
      </SectionShell>
    </div>
  );
}
