import { Link } from "react-router-dom";
import { SectionShell } from "../components/ui/primitives";

// Each icon carries its own brand colour rather than inheriting the link's
// text colour, so the social row reads as recognisable platform marks
// (Facebook blue, Instagram pink, YouTube red, etc.) instead of a row of
// identical accent-green glyphs.
const PLATFORM_ICONS = {
  web:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-ink-muted"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  facebook:  <svg viewBox="0 0 24 24" fill="#1877F2" className="h-3.5 w-3.5 shrink-0"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>,
  instagram: <svg viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><circle cx="17.5" cy="6.5" r="1.15" fill="#E1306C" stroke="none"/></svg>,
  youtube:   <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0"><path fill="#FF0000" d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="#fff"/></svg>,
  x:         <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-ink"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.845L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  email:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-ink-muted"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
};

const SECTIONS = [
  { id: "governance", nav: "Governance" },
  { id: "clubs",      nav: "Clubs" },
  { id: "rules",      nav: "Rules" },
  { id: "season",     nav: "Season" },
  { id: "start",      nav: "Get started" },
  { id: "watch",      nav: "Watch" },
];

function SocialLink({ href, label, platform = "web" }) {
  return (
    <a
      href={href}
      target={href.startsWith("mailto") ? undefined : "_blank"}
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline hover:underline-offset-2"
    >
      {PLATFORM_ICONS[platform]}
      {label}
    </a>
  );
}

function Section({ id, title, lead, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-8 first:border-t-0 first:pt-0 sm:py-10">
      <h2 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
      {lead ? <p className="mt-2 max-w-prose text-base leading-relaxed text-ink-muted">{lead}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function CommunityPage() {
  return (
    <div className="pb-16 text-ink">
      <SectionShell as="main" className="py-6 sm:py-10">

        {/* Page title */}
        <header className="mb-8 sm:mb-10">
          <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">Community</h1>
          <p className="mt-2 max-w-prose text-base leading-relaxed text-ink-muted">
            Everything you need to find your way into South African ultimate — who runs it, where to play, the rules, the season, and where to follow along.
          </p>
        </header>

        {/* Scrimmage — primary action */}
        <div className="mb-10 flex flex-col gap-4 border-b border-border pb-10 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-ink sm:text-2xl">Run a pickup game, right now.</h2>
            <p className="max-w-prose text-sm leading-relaxed text-ink-muted">No event setup, no database — just pick your rosters, configure the rules, and go. Track scores, manage timeouts, and log every point in real time. Works offline on the field and generates a full match report when you're done.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {["Live scoreboard", "Offline-ready", "PDF & CSV export", "ABBA tracking", "Spirit scores"].map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
          <Link to="/admin/scrimmage" className="sc-button shrink-0 self-start whitespace-nowrap sm:self-auto">
            Open scrimmage console
          </Link>
        </div>

        {/* Jump nav */}
        <nav className="mb-2 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold" aria-label="Jump to section">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-accent-strong hover:underline hover:underline-offset-2">
              {s.nav}
            </a>
          ))}
        </nav>

        {/* Who runs the sport */}
        <Section
          id="governance"
          title="Who runs the sport"
          lead="Ultimate in South Africa sits under three tiers of governance, from the global rulebody down to the national association that organises Nationals and the national teams."
        >
          <div className="space-y-6">
            {[
              { badge: "World", name: "World Flying Disc Federation (WFDF)", desc: "The international governing body. It owns the official Rules of Ultimate that every SA game follows, plus the free online accreditation test.", links: [{ label: "wfdf.sport", href: "https://wfdf.sport", p: "web" }, { label: "Rules", href: "https://rules.wfdf.sport", p: "web" }, { label: "SA member page", href: "https://wfdf.sport/members/rsa/", p: "web" }] },
              { badge: "Africa", name: "All Africa Flying Disc Federation (AAFDF)", desc: "The continental body recognised by WFDF, governing flying disc sports across Africa and running the WFDF All African Ultimate Championships (AAUC).", links: [{ label: "aafdf.wfdf.sport", href: "https://aafdf.wfdf.sport", p: "web" }, { label: "Instagram", href: "https://www.instagram.com/aafdf_official/", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/AllAfricaFlyingDisc/", p: "facebook" }] },
              { badge: "South Africa", name: "South African Flying Disc Association (SAFDA)", desc: "The national governing body — it develops the sport, runs Nationals and Regionals, and selects the national teams that represent South Africa abroad.", links: [{ label: "safda.org.za", href: "https://safda.org.za", p: "web" }, { label: "@zaultimate_", href: "https://www.instagram.com/zaultimate_/", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/southafricanultimate/", p: "facebook" }, { label: "YouTube", href: "https://www.youtube.com/@safda_official", p: "youtube" }, { label: "Email exec", href: "mailto:safda-exec@googlegroups.com", p: "email" }] },
            ].map((org) => (
              <div key={org.name}>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{org.badge}</p>
                <p className="mt-0.5 font-semibold text-ink">{org.name}</p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">{org.desc}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {org.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Clubs & where to play */}
        <Section
          id="clubs"
          title="Clubs & where to play"
          lead={<>SAFDA divides the country into four regions — each runs its own tournaments that feed into Nationals. Most clubs welcome beginners at pickup before you commit to a team. For the full list, see <a href="https://safda.org.za/new-clubs/" target="_blank" rel="noreferrer" className="font-semibold text-accent-strong underline underline-offset-2 hover:no-underline">SAFDA's clubs page</a>.</>}
        >
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
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
                <div className="flex items-baseline gap-2">
                  <h3 className="text-lg font-semibold text-ink">{group.label}</h3>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">{group.tag}</span>
                </div>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">{group.desc}</p>
                <ul className="mt-3 space-y-1.5">
                  {group.clubs.map(([name, where]) => (
                    <li key={name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border/60 pb-1.5 text-sm">
                      <span className="text-ink">{name}</span>
                      {where && <span className="text-xs text-ink-muted">{where}</span>}
                    </li>
                  ))}
                </ul>
                {group.links.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {group.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Rules & accreditation */}
        <Section
          id="rules"
          title="Rules & accreditation"
          lead="Ultimate is self-officiated: there are no referees, and players call their own fouls under Spirit of the Game. Knowing the rules — and the hand signals — is part of playing."
        >
          <div className="space-y-6">
            {[
              { title: "WFDF Rules of Ultimate", desc: "The current official rulebook (2025–2028 cycle) plus its Appendix v2.0, used at WFDF Ultimate Events. Read or download the latest version before competitive play.", link: { label: "rules.wfdf.sport", href: "https://rules.wfdf.sport" } },
              { title: "Rules accreditation test", desc: "Free online test with Standard and Advanced levels, unlimited attempts. Many leagues require it — go Advanced if you're past beginner.", link: { label: "Take the test", href: "https://rules.wfdf.sport/accreditation" } },
            ].map((card) => (
              <div key={card.title}>
                <p className="font-semibold text-ink">{card.title}</p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">{card.desc}</p>
                <a href={card.link.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-accent-strong hover:underline hover:underline-offset-2">{card.link.label} →</a>
              </div>
            ))}
            <p className="border-l-2 border-accent/50 pl-4 text-sm leading-relaxed text-ink-muted">
              <span className="font-bold text-ink">Spirit of the Game. </span>
              Competitive play is encouraged, but never at the expense of mutual respect, the rules, or the basic joy of throwing a disc. It's the foundation every game here is built on.
            </p>
          </div>
        </Section>

        {/* Season & major events */}
        <Section
          id="season"
          title="The season & major events"
          lead={<>The competitive year splits into two halves. Regional tournaments qualify teams for Nationals. Exact dates and venues change each year — check <a href="https://safda.org.za/new-safda-events/" target="_blank" rel="noreferrer" className="font-semibold text-accent-strong underline underline-offset-2 hover:no-underline">SAFDA's events page</a> for the current calendar.</>}
        >
          {[
            { heading: "Through the year", rows: [
              { when: "H1", name: "Mixed Nationals", desc: "The flagship mixed-division championship, hosted in the first half of the year. Regionals feed into it." },
              { when: "Pre-Nats", name: "Regionals", desc: "Northern, Western, KZN and Eastern Cape qualifiers that decide who advances to Nationals." },
              { when: "H2", name: "Open & Women's Nationals", desc: "Single-gender national championships in the second half of the year." },
              { when: "Oct", name: "Rocktober", desc: "Gauteng-hosted, often the biggest tournament of the year — high-intensity but social, and a draw for international teams." },
              { when: "Feb", name: "Swinburne Hat", desc: "A relaxed, mixed-up \"hat\" weekend near Harrismith where you're drafted onto a random team. Great first tournament." },
            ]},
            { heading: "Year-round", rows: [
              { when: "", name: "Inter-University Tournament", desc: "Student-only competition for university teams across the country." },
              { when: "", name: "U24 Inter-Regional Tournament", desc: "Regional sides compete to shape national-team selection for World Championships." },
              { when: "", name: "All-Africa Club Championships", desc: "The WFDF-sanctioned continental club event — SA clubs regularly travel and compete." },
            ]},
          ].map((band, i) => (
            <div key={band.heading} className={i > 0 ? "mt-8" : ""}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">{band.heading}</h3>
              <dl className="mt-3 space-y-4">
                {band.rows.map((row) => (
                  <div key={row.name} className="sm:flex sm:gap-4">
                    <dt className="mb-0.5 shrink-0 text-sm font-semibold text-ink sm:mb-0 sm:w-40">
                      {row.when && <span className="mr-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{row.when}</span>}
                      {row.name}
                    </dt>
                    <dd className="max-w-prose text-sm leading-relaxed text-ink-muted">{row.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Section>

        {/* New here? Start throwing */}
        <Section
          id="start"
          title="New here? Start throwing"
          lead="You don't need a team or experience to start. Most clubs run weekly pickup that's free or cheap and beginner-friendly — just show up."
        >
          <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
            {[
              { title: "Find a pickup game", desc: "Browse casual games by city and day of the week, with field locations and WhatsApp links.", links: [{ label: "pickupultimate.com", href: "https://pickupultimate.com", p: "web" }] },
              { title: "Get a disc", desc: "Ultimate uses a 175 g disc. Grab one from a club merch table or an online supplier before your first session.", links: [{ label: "ARIA Discs", href: "https://ariadiscs.com", p: "web" }] },
              { title: "Register to compete", desc: "League and tournament play needs annual club membership (valid to 31 Dec). Your regional body handles sign-up.", links: [{ label: "Western (CTFDA)", href: "https://www.capetownultimate.co.za/", p: "web" }, { label: "Northern (GFDA)", href: "https://www.facebook.com/GautengUltimate/", p: "facebook" }] },
              { title: "Stay in the loop", desc: "The national mailing list and socials carry tournament announcements and the season calendar.", links: [{ label: "@zaultimate_", href: "https://www.instagram.com/zaultimate_/", p: "instagram" }, { label: "SAFDA email", href: "mailto:safda-exec@googlegroups.com", p: "email" }] },
            ].map((card) => (
              <div key={card.title}>
                <p className="font-semibold text-ink">{card.title}</p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">{card.desc}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {card.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p ?? "web"} />)}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Follow & watch */}
        <Section
          id="watch"
          title="Follow & watch"
          lead="SA ultimate clubs and national bodies on social media, plus where to stream the international game."
        >
          <div className="space-y-8">

            {/* SA accounts */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">South African accounts</h3>
              <div className="mt-3 space-y-2.5">
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
                  <div key={row.name} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="min-w-40 text-sm text-ink">{row.name}</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {row.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* International streaming */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">International streaming</h3>
              <div className="mt-3 space-y-4">
                {[
                  { name: "Ultiworld", desc: "The premier ultimate media outlet — subscription streaming of major events, free highlights and a weekly show.", links: [{ label: "ultiworld.com", href: "https://ultiworld.com", p: "web" }, { label: "YouTube", href: "https://www.youtube.com/user/ultiworld", p: "youtube" }] },
                  { name: "WatchUFA (Ultimate Frisbee Association)", desc: "Every pro UFA game streamed live; one free game a week on YouTube as Friday Night Frisbee.", links: [{ label: "watchufa.com", href: "https://watchufa.com", p: "web" }, { label: "YouTube", href: "https://www.youtube.com/channel/UCzInURHrtSH7208Mf1HVqUA", p: "youtube" }] },
                  { name: "ulti.TV", desc: "YouTube channel dedicated to ultimate — live matches and broader community coverage.", links: [{ label: "YouTube", href: "https://www.youtube.com/@ULTIdotTV", p: "youtube" }] },
                ].map((row) => (
                  <div key={row.name}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-semibold text-ink">{row.name}</span>
                      {row.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                    </div>
                    <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-ink-muted">{row.desc}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </Section>

      </SectionShell>
    </div>
  );
}
