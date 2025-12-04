import { useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "../services/userService";
import { supabase } from "../services/supabaseClient";

const ROLE_LIBRARY = {
  admin: {
    label: "Administration",
    description:
      "Configure tournaments, control user access, and manage the master data that powers StallCount.",
    actions: [
      "Approve and manage official crew accounts.",
      "Edit league settings, divisions, and event timelines.",
      "Review audit logs for score adjustments.",
    ],
  },
  media: {
    label: "Media & Communications",
    description:
      "Publish match reports, highlight reels, and updates for the community site.",
    actions: [
      "Queue social posts and match summaries.",
      "Upload photography or video assets.",
      "Coordinate post-match interviews and press briefs.",
    ],
  },
  score_capture: {
    label: "Score Capture",
    description:
      "Operate live tables, sync offline scorepads, and keep crews aligned during play.",
    actions: [
      "Run the live scoreboard monitor.",
      "Reconcile offline submissions from field devices.",
      "Flag dispute reports for head officials.",
    ],
  },
  captain: {
    label: "Team Captains",
    description:
      "Monitor your roster, submit spirit feedback, and review scouting intel.",
    actions: [
      "Submit pre-game rosters and matchup notes.",
      "Complete spirit scoring within the 12-hour window.",
      "Share quick highlights with team channels.",
    ],
  },
};

function normaliseRoles(roleField) {
  if (!roleField) return [];
  return roleField
    .split(",")
    .map((role) => role.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

export default function Dashboard() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    getCurrentUser().then(setProfile);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const recognisedRoles = useMemo(() => {
    if (!profile) return [];
    const parsed = normaliseRoles(profile.role);
    return parsed.filter((role) => Boolean(ROLE_LIBRARY[role]));
  }, [profile]);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading profile...</p>
      </div>
    );
  }

  const fallbackRoles = normaliseRoles(profile.role).filter(
    (role) => !ROLE_LIBRARY[role]
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex w-full items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              StallCount Control
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Welcome back, {profile.full_name || profile.email}
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="w-full space-y-8 px-6 py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Your access</h2>
          <p className="mt-2 text-sm text-slate-600">
            You are logged in with the following advanced privileges. Use the panels
            below to jump into your workflows.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {recognisedRoles.length > 0 ? (
              recognisedRoles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-dark"
                >
                  {ROLE_LIBRARY[role].label}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                General Viewer
              </span>
            )}
          </div>
          {fallbackRoles.length > 0 && (
            <p className="mt-4 text-xs text-slate-500">
              Unknown roles detected: {fallbackRoles.join(", ")}. Please contact an
              administrator to review your access.
            </p>
          )}
        </section>

        {recognisedRoles.length > 0 ? (
          recognisedRoles.map((role) => {
            const module = ROLE_LIBRARY[role];
            return (
              <section
                key={role}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-slate-900">
                      {module.label}
                    </h3>
                    <p className="text-sm text-slate-600">{module.description}</p>
                  </div>
                  <div className="rounded-2xl border border-dashed border-brand/30 bg-brand/5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brand-dark md:self-start">
                    {role.replace(/_/g, " ")}
                  </div>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-600">
                  {module.actions.map((item) => (
                    <li
                      key={item}
                      className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            You currently have viewer-level access. Reach out to an administrator if
            you require elevated permissions for officiating duties.
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Need quick help?</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Operations Desk</p>
              <p className="mt-1 text-xs text-slate-500">
                ops@stallcount.io / +1 (555) 010 2234
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Documentation</p>
              <p className="mt-1 text-xs text-slate-500">
                Review the deployment handbook for process details.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
