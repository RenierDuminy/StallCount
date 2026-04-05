import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Card,
  Chip,
  Field,
  Input,
  Panel,
  SectionHeader,
  SectionShell,
  Textarea,
} from "../components/ui/primitives";
import {
  executeCustomScript,
  getCustomScriptBySlug,
  listCustomScripts,
  resetCustomScriptOverride,
  saveCustomScriptOverride,
} from "../services/customScriptService";

const formatTimestamp = (value) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatJson = (value) => {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export default function CustomScriptsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scripts, setScripts] = useState(() => listCustomScripts());
  const [selectedSlug, setSelectedSlug] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [eventId, setEventId] = useState(searchParams.get("eventId") || "");
  const [runState, setRunState] = useState({
    running: false,
    output: null,
    error: "",
  });
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const availableScripts = listCustomScripts();
    setScripts(availableScripts);

    const requestedSlug = searchParams.get("script");
    const fallbackSlug = availableScripts[0]?.slug || "";
    const nextSlug =
      availableScripts.some((script) => script.slug === requestedSlug)
        ? requestedSlug
        : selectedSlug && availableScripts.some((script) => script.slug === selectedSlug)
          ? selectedSlug
          : fallbackSlug;

    setSelectedSlug(nextSlug);
  }, [searchParams, selectedSlug]);

  useEffect(() => {
    const selectedScript = getCustomScriptBySlug(selectedSlug);
    setDraftSource(selectedScript?.source || "");
    setSaveMessage("");
  }, [selectedSlug]);

  const selectedScript = useMemo(
    () => scripts.find((script) => script.slug === selectedSlug) || null,
    [scripts, selectedSlug],
  );

  const isDirty = Boolean(selectedScript) && draftSource !== selectedScript.source;

  const handleSelectScript = (slug) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("script", slug);
    if (eventId) {
      nextParams.set("eventId", eventId);
    } else {
      nextParams.delete("eventId");
    }
    setSearchParams(nextParams, { replace: true });
    setSelectedSlug(slug);
    setRunState({ running: false, output: null, error: "" });
  };

  const handleSave = () => {
    if (!selectedScript) return;
    const updatedScript = saveCustomScriptOverride(selectedScript.slug, draftSource);
    const nextScripts = listCustomScripts();
    setScripts(nextScripts);
    setDraftSource(updatedScript?.source || draftSource);
    setSaveMessage("Saved local override for this browser.");
  };

  const handleReset = () => {
    if (!selectedScript) return;
    const resetScript = resetCustomScriptOverride(selectedScript.slug);
    setScripts(listCustomScripts());
    setDraftSource(resetScript?.source || "");
    setSaveMessage("Reset to bundled source.");
  };

  const handleRun = async () => {
    if (!selectedScript) return;

    setRunState({ running: true, output: null, error: "" });
    const output = await executeCustomScript({
      slug: selectedScript.slug,
      source: draftSource,
      context: {
        eventId: eventId || null,
      },
    });

    setRunState({
      running: false,
      output,
      error: output.ok ? "" : output.error?.message || "Script failed.",
    });
  };

  return (
    <div className="pb-16 text-ink">
      <SectionShell as="header" className="py-6">
        <Card className="space-y-4 p-6 sm:p-8">
          <SectionHeader
            eyebrow="Admin"
            title="Custom scripts"
            description="Bundled JS scripts with editable local overrides and an in-app runner."
            action={
              <Link to="/admin" className="sc-button is-ghost">
                Back to admin
              </Link>
            }
          />
          <Panel variant="muted" className="p-4 text-sm text-ink-muted">
            Script edits are stored as local overrides in this browser. Running a script can still change shared event
            data if the script writes through Supabase.
          </Panel>
        </Card>
      </SectionShell>

      <SectionShell as="main" className="space-y-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="space-y-4 p-5 sm:p-6">
            <SectionHeader eyebrow="Catalog" title="Available scripts" />
            <div className="space-y-3">
              {scripts.map((script) => {
                const isSelected = script.slug === selectedSlug;
                return (
                  <button
                    key={script.slug}
                    type="button"
                    onClick={() => handleSelectScript(script.slug)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-[var(--sc-accent)] bg-surface text-ink"
                        : "border-border bg-surface-muted text-ink-muted hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-inherit">{script.name}</p>
                        <p className="text-xs text-inherit/80">{script.slug}</p>
                      </div>
                      {script.isOverridden ? <Chip>Edited</Chip> : null}
                    </div>
                    <p className="mt-2 text-xs text-inherit/80">
                      Updated: {formatTimestamp(script.updatedAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="space-y-4 p-5 sm:p-6">
              <SectionHeader
                eyebrow="Editor"
                title={selectedScript?.name || "Custom script"}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedScript?.isOverridden ? <Chip>Local override</Chip> : <Chip>Bundled source</Chip>}
                    <Chip>{selectedScript?.slug || "No script"}</Chip>
                  </div>
                }
              />

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <Field
                  label="Script source"
                  hint="Assign an async function to module.exports. It receives { context, supabase, helpers, log, console }."
                >
                  <Textarea
                    value={draftSource}
                    onChange={(event) => setDraftSource(event.target.value)}
                    rows={24}
                    className="min-h-[28rem] font-mono text-xs leading-5"
                    spellCheck={false}
                  />
                </Field>

                <div className="space-y-4">
                  <Field
                    label="Event context"
                    hint="Passed to the script as context.eventId."
                  >
                    <Input
                      value={eventId}
                      onChange={(event) => setEventId(event.target.value)}
                      placeholder="Optional event ID"
                    />
                  </Field>

                  <Panel variant="muted" className="space-y-3 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Actions
                    </p>
                    <button
                      type="button"
                      className="sc-button w-full"
                      disabled={!selectedScript || runState.running}
                      onClick={handleRun}
                    >
                      {runState.running ? "Running..." : "Run script"}
                    </button>
                    <button
                      type="button"
                      className="sc-button is-ghost w-full"
                      disabled={!selectedScript || !isDirty}
                      onClick={handleSave}
                    >
                      Save override
                    </button>
                    <button
                      type="button"
                      className="sc-button is-ghost w-full"
                      disabled={!selectedScript?.isOverridden}
                      onClick={handleReset}
                    >
                      Reset to bundled source
                    </button>
                    {saveMessage ? (
                      <p className="text-xs text-emerald-300">{saveMessage}</p>
                    ) : null}
                    {runState.error ? (
                      <p className="text-xs text-rose-300">{runState.error}</p>
                    ) : null}
                  </Panel>
                </div>
              </div>
            </Card>

            <Card className="space-y-4 p-5 sm:p-6">
              <SectionHeader eyebrow="Runner" title="Latest output" />
              {!runState.output ? (
                <Panel variant="muted" className="p-4 text-sm text-ink-muted">
                  Run a script to inspect its logs and returned payload.
                </Panel>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Panel variant="muted" className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip>{runState.output.ok ? "Success" : "Failed"}</Chip>
                      <Chip>{runState.output.slug}</Chip>
                    </div>
                    <p className="text-xs text-ink-muted">
                      Started: {formatTimestamp(runState.output.startedAt)}
                    </p>
                    <Field label="Result payload">
                      <pre className="max-h-[24rem] overflow-auto rounded-2xl border border-border bg-surface p-3 text-xs text-ink-muted">
                        {formatJson(runState.output.ok ? runState.output.result : runState.output.error)}
                      </pre>
                    </Field>
                  </Panel>

                  <Panel variant="muted" className="space-y-3 p-4">
                    <Field label="Logs">
                      <pre className="max-h-[24rem] overflow-auto rounded-2xl border border-border bg-surface p-3 text-xs text-ink-muted">
                        {runState.output.logs?.length
                          ? runState.output.logs.join("\n")
                          : "No logs emitted."}
                      </pre>
                    </Field>
                  </Panel>
                </div>
              )}
            </Card>
          </div>
        </div>
      </SectionShell>
    </div>
  );
}
