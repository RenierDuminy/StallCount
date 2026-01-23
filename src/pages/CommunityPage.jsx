import { Link } from "react-router-dom";
import { Card, Panel, SectionHeader, SectionShell, Chip } from "../components/ui/primitives";

const COMMUNITY_RESOURCES = [
  {
    title: "Upcoming events",
    description: "Find leagues, tournaments, and clinics in one place.",
    to: "/events",
    tag: "Events",
  },
  {
    title: "Find teams",
    description: "Browse teams, captains, and rosters across divisions.",
    to: "/teams",
    tag: "Teams",
  },
  {
    title: "Player directory",
    description: "Search players to connect for tryouts or pickups.",
    to: "/players",
    tag: "Players",
  },
  {
    title: "Match hub",
    description: "Track live and recent match results.",
    to: "/matches",
    tag: "Matches",
  },
  {
    title: "Spirit scores",
    description: "Celebrate sportsmanship and highlight great spirit.",
    to: "/spirit-scores",
    tag: "Spirit",
  },
  {
    title: "Notifications",
    description: "Opt in to alerts for schedules, results, and updates.",
    to: "/notifications",
    tag: "Alerts",
  },
];

const SCRIMMAGE_FEATURES = [
  {
    title: "local scorekeeping",
    description: "Easily keep track of scores and game details.",
  },
  {
    title: "Quick exports",
    description: "Download data and share the game summary.",
  },
];

export default function CommunityPage() {
  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Community"
            title="Connect with the Ultimate Frisbee community."
            description="Track scrimmages, discover resources, and stay connected across the league."
          />
        </Card>
      </SectionShell>

      <SectionShell as="section" className="space-y-4 sm:space-y-6">
        <Card className="space-y-4 p-6">
          <SectionHeader
            eyebrow="Scrimmage"
            title="Run pickup games with real-time tools."
            description="Keep reps organized with live scoring and a shared play log."

          />
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              {SCRIMMAGE_FEATURES.map((feature) => (
                <Panel key={feature.title} variant="muted" className="space-y-2 p-4">
                  <p className="text-sm font-semibold text-ink">{feature.title}</p>
                  <p className="text-sm text-ink-muted">{feature.description}</p>
                </Panel>
              ))}
            </div>
          </div>
              <Link to="/admin/scrimmage" className="sc-button">
                Open scrimmage console
              </Link>
        </Card>
      </SectionShell>

      <SectionShell as="section" className="space-y-4 sm:space-y-6">
        <Card className="space-y-4 p-6">
          <SectionHeader
            eyebrow="Resources"
            title="Community resources"
            description="Everything you need to stay plugged in with your local ultimate scene."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {COMMUNITY_RESOURCES.map((resource) => (
              <Card key={resource.title} variant="muted" className="flex h-full flex-col gap-3 p-5">
                <div className="space-y-2">
                  <Chip variant="tag">{resource.tag}</Chip>
                  <h3 className="text-lg font-semibold text-ink">{resource.title}</h3>
                  <p className="text-sm text-ink-muted">{resource.description}</p>
                </div>
                <Link to={resource.to} className="sc-button is-ghost mt-auto justify-center">
                  Explore
                </Link>
              </Card>
            ))}
          </div>
        </Card>
      </SectionShell>
    </div>
  );
}
