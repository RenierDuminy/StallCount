import { Link } from "react-router-dom";
import { Card, SectionShell } from "../components/ui/primitives";

const PLATFORM_ICONS = {
  web:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  facebook:  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>,
  instagram: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>,
  youtube:   <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white"/></svg>,
  x:         <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.845L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  email:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
};

// Local palette for this light-on-white reference page. Tokenized here so the
// hardcoded values live in one place instead of being scattered through markup.
const COMMUNITY_VARS = {
  "--cm-ink": "#1a2e22",
  "--cm-ink-soft": "#4a6050",
  "--cm-ink-faint": "#7c9e8a",
  "--cm-line": "#dde8de",
  "--cm-line-soft": "#eef2ee",
  "--cm-line-faint": "#f3f7f3",
  "--cm-surface-tint": "#f0f5f1",
  "--cm-surface-tint-2": "#f7f9f7",
  "--cm-chip-bg": "#e8f0e9",
  "--cm-chip-bg-hover": "#d6e8d9",
  "--cm-link": "#2d7a4f",
  "--cm-link-soft": "#3a6647",
  "--cm-dark": "#1a2e22",
};

// Per-section accent hues give each card its own identity instead of cloning
// one template. Kept inside the green family so the page still reads as one set.
const SECTION_ICONS = {
  globe:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>,
  pin:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  book:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  disc:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><ellipse cx="12" cy="12" rx="9" ry="4.5"/><ellipse cx="12" cy="12" rx="4" ry="2"/></svg>,
  play:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 9 4 3-4 3z" fill="currentColor"/></svg>,
};

const SECTIONS = [
  { id: "governance", nav: "Governance", icon: "globe",    accent: "#2d7a4f" },
  { id: "clubs",      nav: "Clubs",      icon: "pin",      accent: "#1f8a6d" },
  { id: "rules",      nav: "Rules",      icon: "book",     accent: "#3a7a52" },
  { id: "season",     nav: "Season",     icon: "calendar", accent: "#5a8a3a" },
  { id: "start",      nav: "Get started",icon: "disc",     accent: "#2d7a4f" },
  { id: "watch",      nav: "Watch",      icon: "play",     accent: "#1f7aa8" },
];

function SocialLink({ href, label, platform = "web" }) {
  return (
    <a href={href} target={href.startsWith("mailto") ? undefined : "_blank"} rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--cm-chip-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--cm-link)] transition-colors hover:bg-[var(--cm-chip-bg-hover)]">
      {PLATFORM_ICONS[platform]}
      {label}
    </a>
  );
}

// Shared section header with an accent icon badge + lead. `tone="dark"` is
// reserved for the single most important section (governance).
function SectionHead({ section, title, lead, tone = "light" }) {
  const dark = tone === "dark";
  return (
    <div
      className={`flex items-start gap-3.5 border-b px-5 py-4 sm:px-8 sm:py-5 ${dark ? "" : "bg-[var(--cm-surface-tint)]"}`}
      style={dark
        ? { background: "var(--cm-dark)", borderColor: "var(--cm-line)" }
        : { borderColor: "var(--cm-line)" }}
    >
      <span
        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
        style={dark
          ? { background: "rgba(255,255,255,0.12)", color: "#fff" }
          : { background: `${section.accent}1a`, color: section.accent }}
      >
        {SECTION_ICONS[section.icon]}
      </span>
      <div className="min-w-0">
        <h2 className={`text-xl font-bold sm:text-2xl ${dark ? "text-white" : "text-[var(--cm-ink)]"}`}>{title}</h2>
        <p className={`mt-1 text-sm leading-relaxed ${dark ? "text-white/60" : "text-[var(--cm-ink-soft)]"}`}>{lead}</p>
      </div>
    </div>
  );
}

function SectionCard({ section, children }) {
  return (
    <section
      id={section.id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border bg-white shadow-sm"
      style={{ borderColor: "var(--cm-line)", borderTop: `3px solid ${section.accent}` }}
    >
      {children}
    </section>
  );
}

export default function CommunityPage() {
  const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

  return (
    <div className="pb-16 text-ink" style={COMMUNITY_VARS}>
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

        {/* Sticky jump nav — orients the reader through a long reference page */}
        <nav
          className="sticky top-2 z-10 -mx-1 flex gap-1.5 overflow-x-auto rounded-xl border px-2 py-2 shadow-sm backdrop-blur sm:mx-0 sm:gap-2"
          style={{ borderColor: "var(--cm-line)", background: "rgba(255,255,255,0.92)" }}
          aria-label="Jump to section"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--cm-chip-bg)]"
              style={{ color: "var(--cm-ink-soft)" }}
            >
              <span style={{ color: s.accent }}>{SECTION_ICONS[s.icon]}</span>
              {s.nav}
            </a>
          ))}
        </nav>

        {/* Community resources */}
        <div className="space-y-3">

          {/* Who runs the sport */}
          <SectionCard section={byId.governance}>
            <SectionHead
              section={byId.governance}
              tone="dark"
              title="Who runs the sport"
              lead="Ultimate in South Africa sits under three tiers of governance, from the global rulebody down to the national association that organises Nationals and the national teams."
            />
            <div className="divide-y" style={{ borderColor: "var(--cm-line-soft)" }}>
              {[
                { badge: "WORLD", name: "World Flying Disc Federation (WFDF)", desc: "The international governing body. It owns the official Rules of Ultimate that every SA game follows, plus the free online accreditation test.", links: [{ label: "wfdf.sport", href: "https://wfdf.sport", p: "web" }, { label: "Rules", href: "https://rules.wfdf.sport", p: "web" }, { label: "SA member page", href: "https://wfdf.sport/members/rsa/", p: "web" }] },
                { badge: "AFRICA", name: "All Africa Flying Disc Federation (AAFDF)", desc: "The continental body recognised by WFDF, governing flying disc sports across Africa and running the WFDF All African Ultimate Championships (AAUC).", links: [{ label: "aafdf.wfdf.sport", href: "https://aafdf.wfdf.sport", p: "web" }, { label: "Instagram", href: "https://www.instagram.com/aafdf_official/", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/AllAfricaFlyingDisc/", p: "facebook" }] },
                { badge: "SOUTH AFRICA", name: "South African Flying Disc Association (SAFDA)", desc: "The national governing body — it develops the sport, runs Nationals and Regionals, and selects the national teams that represent South Africa abroad.", links: [{ label: "safda.org.za", href: "https://safda.org.za", p: "web" }, { label: "@zaultimate_", href: "https://www.instagram.com/zaultimate_/", p: "instagram" }, { label: "Facebook", href: "https://www.facebook.com/southafricanultimate/", p: "facebook" }, { label: "YouTube", href: "https://www.youtube.com/@safda_official", p: "youtube" }, { label: "Email exec", href: "mailto:safda-exec@googlegroups.com", p: "email" }] },
              ].map((org) => (
                <div key={org.name} className="px-5 py-4 sm:px-8 sm:py-5" style={{ borderColor: "var(--cm-line-soft)" }}>
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span className="shrink-0 rounded-md bg-[var(--cm-chip-bg)] px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[var(--cm-link-soft)]">{org.badge}</span>
                    <p className="font-semibold text-[var(--cm-ink)]">{org.name}</p>
                  </div>
                  <p className="mb-2.5 text-sm leading-relaxed text-[var(--cm-ink-soft)]">{org.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {org.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Clubs & where to play */}
          <SectionCard section={byId.clubs}>
            <SectionHead
              section={byId.clubs}
              title="Clubs & where to play"
              lead={<>SAFDA divides the country into four regions — each runs its own tournaments that feed into Nationals. Most clubs welcome beginners at pickup before you commit to a team. For the full list, see <a href="https://safda.org.za/new-clubs/" target="_blank" rel="noreferrer" className="font-semibold text-[var(--cm-link)] underline underline-offset-2 hover:no-underline">SAFDA's clubs page</a>.</>}
            />
            <div className="divide-y sm:grid sm:grid-cols-2 sm:divide-y-0" style={{ borderColor: "var(--cm-line-soft)" }}>
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
                <div key={group.tag} className="flex flex-col border-[var(--cm-line-soft)] sm:[&:nth-child(odd)]:border-r" style={{ borderColor: "var(--cm-line-soft)" }}>
                  <div className="bg-[var(--cm-surface-tint-2)] px-5 py-3 sm:px-8">
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-bold text-[var(--cm-ink)]">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: byId.clubs.accent }} />
                        {group.label}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] font-bold tracking-wider text-[var(--cm-link)]">
                        <span className="rounded-full bg-[var(--cm-chip-bg)] px-1.5 py-0.5 text-[var(--cm-link-soft)]">{group.clubs.length} clubs</span>
                        {group.tag}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--cm-ink-faint)]">{group.desc}</p>
                  </div>
                  <div className="flex-1 divide-y px-5 sm:px-8" style={{ borderColor: "var(--cm-line-faint)" }}>
                    {group.clubs.map(([name, where]) => (
                      <div key={name} className="flex items-baseline justify-between gap-4 py-2.5" style={{ borderColor: "var(--cm-line-faint)" }}>
                        <span className="text-sm text-[var(--cm-ink)]">{name}</span>
                        {where && <span className="shrink-0 text-xs text-[var(--cm-ink-faint)]">{where}</span>}
                      </div>
                    ))}
                  </div>
                  {group.links.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-t bg-[var(--cm-surface-tint-2)] px-5 py-3 sm:px-8" style={{ borderColor: "var(--cm-line-soft)" }}>
                      {group.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Rules & accreditation */}
          <SectionCard section={byId.rules}>
            <SectionHead
              section={byId.rules}
              title="Rules & accreditation"
              lead="Ultimate is self-officiated: there are no referees, and players call their own fouls under Spirit of the Game. Knowing the rules — and the hand signals — is part of playing."
            />
            <div className="divide-y" style={{ borderColor: "var(--cm-line-soft)" }}>
              {[
                { title: "WFDF Rules of Ultimate", desc: "The current official rulebook (2025–2028 cycle) plus its Appendix v2.0, used at WFDF Ultimate Events. Read or download the latest version before competitive play.", link: { label: "rules.wfdf.sport", href: "https://rules.wfdf.sport" } },
                { title: "Rules accreditation test", desc: "Free online test with Standard and Advanced levels, unlimited attempts. Many leagues require it — go Advanced if you're past beginner.", link: { label: "Take the test", href: "https://rules.wfdf.sport/accreditation" } },
              ].map((card) => (
                <div key={card.title} className="flex items-start justify-between gap-4 px-5 py-4 sm:px-8 sm:py-5" style={{ borderColor: "var(--cm-line-soft)" }}>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--cm-ink)]">{card.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--cm-ink-soft)]">{card.desc}</p>
                  </div>
                  <a href={card.link.href} target="_blank" rel="noreferrer" className="shrink-0 whitespace-nowrap rounded-lg bg-[var(--cm-chip-bg)] px-3 py-2 text-sm font-bold text-[var(--cm-link)] transition-colors hover:bg-[var(--cm-chip-bg-hover)]">{card.link.label}</a>
                </div>
              ))}
              <div className="px-5 py-4 sm:px-8 sm:py-5" style={{ background: "var(--cm-dark)" }}>
                <p className="text-sm leading-relaxed text-white/70"><span className="font-bold text-white">Spirit of the Game. </span>Competitive play is encouraged, but never at the expense of mutual respect, the rules, or the basic joy of throwing a disc. It's the foundation every game here is built on.</p>
              </div>
            </div>
          </SectionCard>

          {/* Season & major events — rendered as a vertical timeline */}
          <SectionCard section={byId.season}>
            <SectionHead
              section={byId.season}
              title="The season & major events"
              lead={<>The competitive year splits into two halves. Regional tournaments qualify teams for Nationals. Exact dates and venues change each year — check <a href="https://safda.org.za/new-safda-events/" target="_blank" rel="noreferrer" className="font-semibold text-[var(--cm-link)] underline underline-offset-2 hover:no-underline">SAFDA's events page</a> for the current calendar.</>}
            />
            <div className="px-5 py-5 sm:px-8 sm:py-6">
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
              ].map((band) => (
                <div key={band.heading} className="mb-5 last:mb-0">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--cm-ink-faint)]">{band.heading}</p>
                  <ol className="relative ml-2 border-l-2 pl-6" style={{ borderColor: "var(--cm-line)" }}>
                    {band.rows.map((row) => (
                      <li key={row.name} className="relative pb-5 last:pb-0">
                        <span
                          className="absolute -left-[1.95rem] top-1 grid h-4 w-4 place-items-center rounded-full ring-4 ring-white"
                          style={{ background: byId.season.accent }}
                        />
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                          {row.when && (
                            <span className="rounded-md bg-[var(--cm-chip-bg)] px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[var(--cm-link-soft)]">{row.when}</span>
                          )}
                          <p className="font-semibold text-[var(--cm-ink)]">{row.name}</p>
                        </div>
                        <p className="mt-0.5 text-sm leading-relaxed text-[var(--cm-ink-soft)]">{row.desc}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* New here? Start throwing */}
          <SectionCard section={byId.start}>
            <SectionHead
              section={byId.start}
              title="New here? Start throwing"
              lead="You don't need a team or experience to start. Most clubs run weekly pickup that's free or cheap and beginner-friendly — just show up."
            />
            <div className="divide-y sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0" style={{ borderColor: "var(--cm-line-soft)" }}>
              {[
                { title: "Find a pickup game", desc: "Browse casual games by city and day of the week, with field locations and WhatsApp links.", links: [{ label: "pickupultimate.com", href: "https://pickupultimate.com", p: "web" }] },
                { title: "Get a disc", desc: "Ultimate uses a 175 g disc. Grab one from a club merch table or an online supplier before your first session.", links: [{ label: "ARIA Discs", href: "https://ariadiscs.com", p: "web" }] },
                { title: "Register to compete", desc: "League and tournament play needs annual club membership (valid to 31 Dec). Your regional body handles sign-up.", links: [{ label: "Western (CTFDA)", href: "https://www.capetownultimate.co.za/", p: "web" }, { label: "Northern (GFDA)", href: "https://www.facebook.com/GautengUltimate/", p: "facebook" }] },
                { title: "Stay in the loop", desc: "The national mailing list and socials carry tournament announcements and the season calendar.", links: [{ label: "@zaultimate_", href: "https://www.instagram.com/zaultimate_/", p: "instagram" }, { label: "SAFDA email", href: "mailto:safda-exec@googlegroups.com", p: "email" }] },
              ].map((card) => (
                <div key={card.title} className="px-5 py-4 sm:px-8 sm:py-5" style={{ borderColor: "var(--cm-line-soft)" }}>
                  <p className="mb-1 font-semibold text-[var(--cm-ink)]">{card.title}</p>
                  <p className="mb-3 text-sm leading-relaxed text-[var(--cm-ink-soft)]">{card.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {card.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p ?? "web"} />)}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Follow & watch */}
          <SectionCard section={byId.watch}>
            <SectionHead
              section={byId.watch}
              title="Follow & watch"
              lead="SA ultimate clubs and national bodies on social media, plus where to stream the international game."
            />
            <div className="divide-y" style={{ borderColor: "var(--cm-line-soft)" }}>

              {/* SA accounts */}
              <div className="px-5 py-4 sm:px-8 sm:py-5" style={{ borderColor: "var(--cm-line-soft)" }}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--cm-ink-faint)]">South African accounts</p>
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
                      <span className="min-w-[160px] text-sm font-medium text-[var(--cm-ink)]">{row.name}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {row.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* International streaming */}
              <div className="px-5 py-4 sm:px-8 sm:py-5" style={{ borderColor: "var(--cm-line-soft)" }}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--cm-ink-faint)]">International streaming</p>
                <div className="space-y-3">
                  {[
                    { name: "Ultiworld", desc: "The premier ultimate media outlet — subscription streaming of major events, free highlights and a weekly show.", links: [{ label: "ultiworld.com", href: "https://ultiworld.com", p: "web" }, { label: "YouTube", href: "https://www.youtube.com/user/ultiworld", p: "youtube" }] },
                    { name: "WatchUFA (Ultimate Frisbee Association)", desc: "Every pro UFA game streamed live; one free game a week on YouTube as Friday Night Frisbee.", links: [{ label: "watchufa.com", href: "https://watchufa.com", p: "web" }, { label: "YouTube", href: "https://www.youtube.com/channel/UCzInURHrtSH7208Mf1HVqUA", p: "youtube" }] },
                    { name: "ulti.TV", desc: "YouTube channel dedicated to ultimate — live matches and broader community coverage.", links: [{ label: "YouTube", href: "https://www.youtube.com/@ULTIdotTV", p: "youtube" }] },
                  ].map((row) => (
                    <div key={row.name}>
                      <div className="mb-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="text-sm font-semibold text-[var(--cm-ink)]">{row.name}</span>
                        {row.links.map((l) => <SocialLink key={l.label} href={l.href} label={l.label} platform={l.p} />)}
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--cm-ink-faint)]">{row.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </SectionCard>

        </div>

      </SectionShell>
    </div>
  );
}
