import { Fragment } from "react";
import { Link } from "react-router-dom";
import { SectionShell } from "../components/ui/primitives";

// A plain reference page: headings, paragraphs, tables and underlined text
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
  { id: "scrimmage", title: "Scoring a pickup game" },
];

const ORGANISATIONS = [
  {
    name: "World Flying Disc Federation (WFDF)",
    desc: "The international governing body. It publishes the official Rules of Ultimate that every South African game follows, and the free online rules accreditation.",
    links: [
      { label: "wfdf.sport", href: "https://wfdf.sport" },
      { label: "Rules of Ultimate", href: "https://rules.wfdf.sport" },
      { label: "South Africa member page", href: "https://wfdf.sport/members/rsa/" },
    ],
  },
  {
    name: "All Africa Flying Disc Federation (AAFDF)",
    desc: "The continental body recognised by WFDF. It governs flying disc sports across Africa and runs the WFDF All African Ultimate Championships.",
    links: [
      { label: "aafdf.wfdf.sport", href: "https://aafdf.wfdf.sport" },
      { label: "Instagram", href: "https://www.instagram.com/aafdf_official/" },
      { label: "Facebook", href: "https://www.facebook.com/AllAfricaFlyingDisc/" },
    ],
  },
  {
    name: "South African Flying Disc Association (SAFDA)",
    desc: "The national governing body. It develops the sport, runs Regionals and Nationals, and selects the national teams.",
    links: [
      { label: "safda.org.za", href: "https://safda.org.za" },
      { label: "Instagram", href: "https://www.instagram.com/zaultimate_/" },
      { label: "Facebook", href: "https://www.facebook.com/southafricanultimate/" },
      { label: "YouTube", href: "https://www.youtube.com/@safda_official" },
      { label: "Email the executive", href: "mailto:safda-exec@googlegroups.com" },
    ],
  },
];

const REGIONS = [
  {
    name: "Western",
    body: "CTFDA",
    desc: "Western Cape and Northern Cape. One of the oldest and deepest scenes, centred on Cape Town and Stellenbosch.",
    clubs: [
      ["UCT Flying Tigers / Roaring Tigers", "UCT, Cape Town"],
      ["Chilli Ultimate", "Pinelands, Cape Town"],
      ["Catch 22", "Cape Town"],
      ["Ghost Ultimate Club", "Cape Town"],
      ["Salusa 45", "Cape Town"],
      ["Maties Ultimate", "Stellenbosch"],
    ],
    links: [
      { label: "capetownultimate.co.za", href: "https://www.capetownultimate.co.za/" },
      { label: "Facebook", href: "https://www.facebook.com/capetownultimate/" },
      { label: "Pickup games in Cape Town", href: "https://pickupultimate.com/cities/cape-town" },
    ],
  },
  {
    name: "Northern",
    body: "GFDA",
    desc: "Gauteng, Free State, Mpumalanga, North West and Limpopo. The largest and busiest region, centred on Johannesburg and Pretoria.",
    clubs: [
      ["Ultitude", "Greenside, Johannesburg"],
      ["Skyveld", "Johannesburg"],
      ["Zone Rangers / Rex", "Johannesburg and Pretoria"],
      ["Wits Voodoo Kudus", "Wits, Johannesburg"],
      ["Soweto Ultimate", "Soweto"],
      ["Orange Farm", "Johannesburg"],
      ["Disks of Hazard", "Tuks, Pretoria"],
      ["Labradors", "Pretoria"],
      ["Elevation", "Potchefstroom"],
    ],
    links: [
      { label: "Gauteng Ultimate on Facebook", href: "https://www.facebook.com/GautengUltimate/" },
      { label: "Ultitude blog", href: "https://ultitudeclub.wordpress.com/" },
      { label: "Wits Ultimate", href: "https://www.wits.ac.za/sport/clubs/ultimate-frisbee/" },
      { label: "Pickup games in Johannesburg", href: "https://pickupultimate.com/cities/johannesburg" },
    ],
  },
  {
    name: "KwaZulu-Natal",
    body: "KZN",
    desc: "Durban, Pietermaritzburg and the Midlands, with several long-standing competitive clubs.",
    clubs: [
      ["Long Donkeys", "Pietermaritzburg"],
      ["Bunnies", "Durban"],
      ["4th Prime", "Howick"],
      ["Rambs", "KwaZulu-Natal"],
    ],
    links: [
      { label: "Durban Ultimate on Facebook", href: "https://www.facebook.com/DurbanUltimate/" },
      { label: "Long Donkeys on Facebook", href: "https://www.facebook.com/LongDonkeys/" },
    ],
  },
  {
    name: "Eastern Cape",
    body: "EC",
    desc: "Gqeberha, East London and surrounds. A developing region with a growing set of teams.",
    clubs: [
      ["Gale Force", "Gqeberha"],
      ["Hammerheads", "East London"],
      ["Rebels", "East London"],
    ],
    links: [],
  },
];

const SEASON = [
  { name: "Swinburne Hat", when: "February", desc: "A relaxed hat weekend near Harrismith where players are drafted onto random teams. A good first tournament." },
  { name: "Regionals", when: "Before Nationals", desc: "Northern, Western, KwaZulu-Natal and Eastern Cape qualifiers that decide who goes to Nationals." },
  { name: "Mixed Nationals", when: "First half of the year", desc: "The flagship mixed-division championship." },
  { name: "Open and Women's Nationals", when: "Second half of the year", desc: "The single-gender national championships." },
  { name: "Rocktober", when: "October", desc: "Hosted in Gauteng and often the biggest tournament of the year: competitive, social, and a draw for international teams." },
  { name: "Inter-University Tournament", when: "Varies", desc: "Student competition between university teams from across the country." },
  { name: "U24 Inter-Regional Tournament", when: "Varies", desc: "Regional sides compete, and it feeds selection for the national under-24 team." },
  { name: "All-Africa Club Championships", when: "Varies", desc: "The WFDF-sanctioned continental club event, which South African clubs regularly travel to." },
];

const SA_ACCOUNTS = [
  { name: "SAFDA", links: [{ label: "Instagram", href: "https://www.instagram.com/zaultimate_/" }, { label: "Facebook", href: "https://www.facebook.com/southafricanultimate/" }, { label: "YouTube", href: "https://www.youtube.com/@safda_official" }] },
  { name: "RSA Wild Dogs (U24 national team)", links: [{ label: "Instagram", href: "https://www.instagram.com/rsawilddogs/" }] },
  { name: "Cape Town Ultimate (CTFDA)", links: [{ label: "Facebook", href: "https://www.facebook.com/capetownultimate/" }, { label: "YouTube", href: "https://www.youtube.com/@ctfda" }] },
  { name: "UCT Ultimate", links: [{ label: "Instagram", href: "https://www.instagram.com/uct_ultimate/" }, { label: "Facebook", href: "https://www.facebook.com/UCTUltimate" }, { label: "X", href: "https://x.com/uctultimate" }] },
  { name: "Maties Ultimate", links: [{ label: "Instagram", href: "https://www.instagram.com/maties.ultimate" }, { label: "Facebook", href: "https://www.facebook.com/matiesultimateclub/" }, { label: "YouTube", href: "https://www.youtube.com/@matiesultimate" }] },
  { name: "Kaalvoet Kaos", links: [{ label: "YouTube", href: "https://www.youtube.com/@KaalvoetKaosUltimateFrisbee" }] },
  { name: "Chilli Ultimate", links: [{ label: "Facebook", href: "https://www.facebook.com/chilliultimate" }] },
  { name: "Gauteng Ultimate (GFDA)", links: [{ label: "Facebook", href: "https://www.facebook.com/GautengUltimate/" }] },
  { name: "Long Donkeys", links: [{ label: "Facebook", href: "https://www.facebook.com/LongDonkeys/" }] },
  { name: "Durban Ultimate / Bunnies", links: [{ label: "Facebook", href: "https://www.facebook.com/DurbanUltimate/" }] },
];

const STREAMING = [
  { name: "Ultiworld", desc: "Subscription streaming of major events, free highlights and a weekly show.", links: [{ label: "ultiworld.com", href: "https://ultiworld.com" }, { label: "YouTube", href: "https://www.youtube.com/user/ultiworld" }] },
  { name: "WatchUFA", desc: "Every professional UFA game streamed live, with one free game a week on YouTube.", links: [{ label: "watchufa.com", href: "https://watchufa.com" }, { label: "YouTube", href: "https://www.youtube.com/channel/UCzInURHrtSH7208Mf1HVqUA" }] },
  { name: "ulti.TV", desc: "A YouTube channel with live matches and wider community coverage.", links: [{ label: "YouTube", href: "https://www.youtube.com/@ULTIdotTV" }] },
];

const LINK_CLASS = "font-semibold underline underline-offset-2 hover:no-underline";
const TABLE_CELL = "border-b border-white/15 py-2 pr-4 align-top";
const TABLE_HEAD = "border-b border-white/30 py-2 pr-4 text-left text-sm font-semibold text-ink";

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

/** Links separated by a middle dot, like a footer link row. */
function LinkList({ links }) {
  if (!links?.length) return null;
  return (
    <span>
      {links.map((link, index) => (
        <Fragment key={link.href}>
          {index > 0 ? <span className="px-1.5 text-ink/50" aria-hidden="true">·</span> : null}
          <ExternalLink href={link.href}>{link.label}</ExternalLink>
        </Fragment>
      ))}
    </span>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/20 pt-6">
      <h2 className="text-2xl font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-4 text-base leading-relaxed text-ink/85">{children}</div>
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

        <div className="mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,48rem)] lg:gap-12">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-sm font-semibold text-ink">On this page</h2>
            <ol className="mt-2 space-y-1.5 text-sm">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="underline-offset-2 hover:underline">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="space-y-10">
            <Section id="governance" title="Who runs the sport">
              <p>
                Ultimate in South Africa sits under three levels of governance, from the world rules body down to
                the national association that runs Nationals and selects the national teams.
              </p>
              {ORGANISATIONS.map((org) => (
                <div key={org.name}>
                  <SubHeading>{org.name}</SubHeading>
                  <p className="mt-1">{org.desc}</p>
                  <p className="mt-1 text-sm">
                    <LinkList links={org.links} />
                  </p>
                </div>
              ))}
            </Section>

            <Section id="clubs" title="Clubs and where to play">
              <p>
                SAFDA divides the country into four regions, each running its own tournaments that feed into
                Nationals. Most clubs welcome beginners at pickup before you commit to a team. The full list is on{" "}
                <ExternalLink href="https://safda.org.za/new-clubs/">SAFDA&rsquo;s clubs page</ExternalLink>.
              </p>
              {REGIONS.map((region) => (
                <div key={region.name}>
                  <SubHeading>
                    {region.name} <span className="font-normal text-ink/75">({region.body})</span>
                  </SubHeading>
                  <p className="mt-1">{region.desc}</p>
                  <table className="mt-3 w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th scope="col" className={TABLE_HEAD}>Club</th>
                        <th scope="col" className={TABLE_HEAD}>Based in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {region.clubs.map(([club, where]) => (
                        <tr key={club}>
                          <td className={`${TABLE_CELL} text-ink`}>{club}</td>
                          <td className={`${TABLE_CELL} text-ink/75`}>{where}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {region.links.length ? (
                    <p className="mt-2 text-sm">
                      <LinkList links={region.links} />
                    </p>
                  ) : null}
                </div>
              ))}
            </Section>

            <Section id="rules" title="Rules and accreditation">
              <p>
                Ultimate is self-officiated. There are no referees: players call their own fouls under the Spirit
                of the Game, so knowing the rules is part of playing.
              </p>
              <div>
                <SubHeading>WFDF Rules of Ultimate</SubHeading>
                <p className="mt-1">
                  The current official rulebook (2025–2028) and its appendix, used at WFDF events. Read the latest
                  version at <ExternalLink href="https://rules.wfdf.sport">rules.wfdf.sport</ExternalLink>.
                </p>
              </div>
              <div>
                <SubHeading>Rules accreditation</SubHeading>
                <p className="mt-1">
                  A free online test at standard and advanced level, with unlimited attempts. Many leagues require
                  it; take the advanced level once you are past beginner.{" "}
                  <ExternalLink href="https://rules.wfdf.sport/accreditation">Take the accreditation test</ExternalLink>.
                </p>
              </div>
              <blockquote className="border-l-2 border-white/40 pl-4">
                <p>
                  <strong className="text-ink">Spirit of the Game.</strong> Competitive play is encouraged, but never
                  at the expense of mutual respect, the rules, or the basic joy of play.
                </p>
              </blockquote>
            </Section>

            <Section id="season" title="The season">
              <p>
                The competitive year has two halves, with regional tournaments qualifying teams for Nationals. Dates
                and venues change every year; the current calendar is on{" "}
                <ExternalLink href="https://safda.org.za/new-safda-events/">SAFDA&rsquo;s events page</ExternalLink>.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className={TABLE_HEAD}>Event</th>
                      <th scope="col" className={TABLE_HEAD}>When</th>
                      <th scope="col" className={TABLE_HEAD}>About</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEASON.map((row) => (
                      <tr key={row.name}>
                        <td className={`${TABLE_CELL} font-semibold text-ink`}>{row.name}</td>
                        <td className={`${TABLE_CELL} whitespace-nowrap text-ink/75`}>{row.when}</td>
                        <td className={`${TABLE_CELL} text-ink/85`}>{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section id="start" title="Getting started">
              <p>
                You don&rsquo;t need a team or any experience. Most clubs run weekly pickup games that are free or
                cheap and beginner-friendly.
              </p>
              <div>
                <SubHeading>Find a pickup game</SubHeading>
                <p className="mt-1">
                  <ExternalLink href="https://pickupultimate.com">pickupultimate.com</ExternalLink> lists casual
                  games by city and day of the week, with field locations and group chat links.
                </p>
              </div>
              <div>
                <SubHeading>Get a disc</SubHeading>
                <p className="mt-1">
                  Ultimate is played with a 175 g disc. Clubs usually sell them at training and at tournaments.
                </p>
              </div>
              <div>
                <SubHeading>Register to compete</SubHeading>
                <p className="mt-1">
                  League and tournament play needs an annual club membership, valid to 31 December. Your regional
                  body handles registration:{" "}
                  <ExternalLink href="https://www.capetownultimate.co.za/">Western (CTFDA)</ExternalLink> or{" "}
                  <ExternalLink href="https://www.facebook.com/GautengUltimate/">Northern (GFDA)</ExternalLink>.
                </p>
              </div>
              <div>
                <SubHeading>Stay up to date</SubHeading>
                <p className="mt-1">
                  Tournament announcements and the season calendar go out on{" "}
                  <ExternalLink href="https://www.instagram.com/zaultimate_/">SAFDA&rsquo;s Instagram</ExternalLink>{" "}
                  and by <ExternalLink href="mailto:safda-exec@googlegroups.com">email from SAFDA</ExternalLink>.
                </p>
              </div>
            </Section>

            <Section id="follow" title="Follow and watch">
              <SubHeading>South African accounts</SubHeading>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD}>Organisation</th>
                    <th scope="col" className={TABLE_HEAD}>Follow on</th>
                  </tr>
                </thead>
                <tbody>
                  {SA_ACCOUNTS.map((row) => (
                    <tr key={row.name}>
                      <td className={`${TABLE_CELL} text-ink`}>{row.name}</td>
                      <td className={TABLE_CELL}>
                        <LinkList links={row.links} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <SubHeading>International streaming</SubHeading>
              <ul className="space-y-3">
                {STREAMING.map((row) => (
                  <li key={row.name}>
                    <p>
                      <strong className="text-ink">{row.name}.</strong> {row.desc}
                    </p>
                    <p className="text-sm">
                      <LinkList links={row.links} />
                    </p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="scrimmage" title="Scoring a pickup game">
              <p>
                StallCount&rsquo;s scrimmage console scores a game without any event setup. Enter the two rosters,
                set the rules, and track points, timeouts and halftime. It works offline on the field and produces
                a PDF or CSV match report at the end.
              </p>
              <p>
                <Link to="/admin/scrimmage" className={LINK_CLASS}>
                  Open the scrimmage console
                </Link>
              </p>
            </Section>
          </article>
        </div>
      </SectionShell>
    </div>
  );
}
