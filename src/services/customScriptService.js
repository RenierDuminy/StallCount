import { getEventHierarchy } from "./leagueService";
import { getMatchesByEvent } from "./matchService";
import { supabase } from "./supabaseClient";

const rawScriptModules = import.meta.glob("../customScripts/*.js", {
  eager: true,
  query: "?raw",
  import: "default",
});

const OVERRIDE_STORAGE_KEY = "stallcount:custom-script-overrides:v1";
const SERVER_ONLY_SCRIPT_SLUGS = new Set(["STB_RL_26_update_rosters"]);

const slugFromPath = (path) => {
  const match = /\/([^/]+)\.js$/.exec(path);
  return match ? match[1] : path;
};

const toTitle = (slug) =>
  String(slug || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

const getBundledCatalog = () =>
  Object.entries(rawScriptModules)
    .map(([path, source]) => {
      const slug = slugFromPath(path);
      return {
        slug,
        name: toTitle(slug),
        bundledSource: typeof source === "string" ? source : "",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

const safeLocalStorage = () =>
  typeof window !== "undefined" && window.localStorage ? window.localStorage : null;

const readOverrides = () => {
  const storage = safeLocalStorage();
  if (!storage) return {};

  try {
    const rawValue = storage.getItem(OVERRIDE_STORAGE_KEY);
    if (!rawValue) return {};
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[customScriptService] Failed to read script overrides", error);
    return {};
  }
};

const writeOverrides = (nextValue) => {
  const storage = safeLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(nextValue));
  } catch (error) {
    console.error("[customScriptService] Failed to save script overrides", error);
  }
};

const formatLogValue = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export function listCustomScripts() {
  const overrides = readOverrides();
  return getBundledCatalog().map((entry) => {
    const override = overrides[entry.slug];
    const source =
      override && typeof override.source === "string"
        ? override.source
        : entry.bundledSource;

    return {
      slug: entry.slug,
      name: entry.name,
      source,
      bundledSource: entry.bundledSource,
      isOverridden: Boolean(
        override &&
          typeof override.source === "string" &&
          override.source !== entry.bundledSource,
      ),
      updatedAt: override?.updatedAt || null,
    };
  });
}

export function getCustomScriptBySlug(slug) {
  return listCustomScripts().find((entry) => entry.slug === slug) || null;
}

export function saveCustomScriptOverride(slug, source) {
  const base = getBundledCatalog().find((entry) => entry.slug === slug);
  if (!base) {
    throw new Error(`Unknown custom script: ${slug}`);
  }

  const overrides = readOverrides();
  overrides[slug] = {
    source: typeof source === "string" ? source : "",
    updatedAt: new Date().toISOString(),
  };
  writeOverrides(overrides);

  return getCustomScriptBySlug(slug);
}

export function resetCustomScriptOverride(slug) {
  const overrides = readOverrides();
  if (slug in overrides) {
    delete overrides[slug];
    writeOverrides(overrides);
  }
  return getCustomScriptBySlug(slug);
}

export async function executeCustomScript({ slug, source, context = {} }) {
  if (SERVER_ONLY_SCRIPT_SLUGS.has(slug) && !context?.allowBrowserExecution) {
    throw new Error(
      `${slug} is server-run only. Use the backend roster sync endpoint instead of the in-browser runner.`,
    );
  }

  const bundledScript = getBundledCatalog().find((entry) => entry.slug === slug) || null;
  const activeSource =
    typeof source === "string" && source.length > 0
      ? source
      : context?.useBundledSource
        ? bundledScript?.bundledSource || ""
        : getCustomScriptBySlug(slug)?.source || "";

  if (!activeSource) {
    throw new Error(`No source available for script ${slug}.`);
  }

  const logs = [];
  const log = (...args) => {
    logs.push(args.map(formatLogValue).join(" "));
  };

  const consoleProxy = {
    log,
    info: log,
    warn: (...args) => log("[warn]", ...args),
    error: (...args) => log("[error]", ...args),
  };

  const helpers = {
    getEventHierarchy,
    getMatchesByEvent,
  };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction(
    "context",
    "supabase",
    "helpers",
    "log",
    "console",
    `
      "use strict";
      const module = { exports: {} };
      const exports = module.exports;
      ${activeSource}

      const exportedRunner =
        typeof module.exports === "function"
          ? module.exports
          : typeof module.exports?.default === "function"
            ? module.exports.default
            : typeof exports?.default === "function"
              ? exports.default
              : null;

      if (!exportedRunner) {
        throw new Error(
          "Custom scripts must assign an async function to module.exports.",
        );
      }

      return await exportedRunner({
        context,
        supabase,
        helpers,
        log,
        console,
      });
    `,
  );

  const startedAt = new Date().toISOString();

  try {
    const result = await runner(
      {
        ...context,
        slug,
        startedAt,
      },
      supabase,
      helpers,
      log,
      consoleProxy,
    );

    return {
      ok: true,
      slug,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs,
      result,
    };
  } catch (error) {
    const err =
      error instanceof Error
        ? { message: error.message, stack: error.stack || "" }
        : { message: String(error), stack: "" };

    return {
      ok: false,
      slug,
      startedAt,
      finishedAt: new Date().toISOString(),
      logs,
      error: err,
    };
  }
}
