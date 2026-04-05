/* global module */

module.exports = async function stbRl26UpdateRosters({
  context,
  supabase,
  helpers,
  log,
}) {
  const EXPECTED_EVENT_ID = "e6a34716-f9d6-4d70-bc1a-b610a04e3eaf";
  const SCRIPT_VERSION = "2026-04-05-header-debug-1";
  const SIGNUP_CSV_URL_STORAGE_KEY = "stallcount:signup-management:csv-url:v1";
  const SIGNUP_DOB_MODE_STORAGE_KEY = "stallcount:signup-management:dob-mode:v1";
  const SCRIPT_STATE_STORAGE_KEY = "stallcount:custom-script:STB_RL_26_update_rosters:state:v1";
  const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFcNFojsDqBt5T2oca1kMuHvskIqBKnSP6lx5qdX2780Rlbxsl-_6NDaguRieY1x63OQIjU7M6z-Hy/pub?gid=1391076276&single=true&output=csv";
  const DEFAULT_DOB_MODE = "dmy";
  const SIGNUP_DESCRIPTION_PREFIX = "[STB_RL_26 signup]";
  const teamOption = (name, ...teamIds) => ({ name, teamIds });
  const PRIMARY_TEAM_OPTIONS = [
    teamOption("Academia"),
    teamOption("Aurora"),
    teamOption("Capri"),
    teamOption(
      "Dagbreek",
      "a7c03c51-8696-4770-a3b2-352c666ec430",
      "729d6502-a62c-43a3-8807-2785cde5189a",
      "5228b361-c340-4113-8647-4e88802808d5",
    ),
    teamOption(
      "Eendrag",
      "ef0779a7-3ba3-446e-a9b3-89b384fbbb83",
      "9b6a5aa9-de61-4cf9-a151-0b330c10f91e",
      "3e80804d-5ddc-4188-82a9-f76031d17793",
    ),
    teamOption("Goldfields"),
    teamOption("Helderberg", "621cb265-c672-4ff1-abaf-c434947e01e3"),
    teamOption("Helshoogte", "76370afe-9032-4a8d-a091-87ab6855d1ad"),
    teamOption("Huis Marais"),
    teamOption("Huis Visser", "f4a7aa8c-5889-4c2b-80c1-7bbce78019d4"),
    teamOption("Huis Neetling"),
    teamOption("Majuba", "04dbf095-f3a6-4413-bbaf-0c02522fa3e8"),
    teamOption("Metanoia", "27469769-fce6-4743-8435-c416d1fb3203"),
    teamOption("Olympus"),
    teamOption("Oude Molen", "f70a2efb-ea3f-4595-bb3a-a03d33eb87ff"),
    teamOption("Pieke", "f70a2efb-ea3f-4595-bb3a-a03d33eb87ff"),
    teamOption("Simonsberg", "fad6fcce-de5d-4498-8b1b-481ecf4d8101"),
    teamOption(
      "Wilgenhof",
      "72c77ee2-5d7f-4ebd-8bab-0c9df05f8345",
      "4ccc772c-8c73-4804-802d-f3697d07fb72",
    ),
    teamOption("Vesta"),
    teamOption("Barbarians", "f346e038-d4d6-45ab-9c50-caf842d5808d"),
  ];
  const SECONDARY_TEAM_OPTIONS = [
    teamOption("Academia"),
    teamOption("Aristea", "88edb974-649e-4bfc-92d0-ebc04ec64161"),
    teamOption("Aurora"),
    teamOption("Capri"),
    teamOption("Equite", "528fda20-3ff8-43ed-855d-58a0ce53befc"),
    teamOption("Erica"),
    teamOption("Goldfields"),
    teamOption("Harmonie", "d1e84d70-4302-488f-bd4b-05393f7c456b"),
    teamOption("Heemstede"),
    teamOption("Huis Neethling"),
    teamOption("Huis ten Bosch", "6ad73cfa-d99d-447a-ae5f-1e2be36f2594"),
    teamOption("Irene", "79f344b4-977b-4460-b512-8ee468a591b3"),
    teamOption("Isa", "7b3aa1b4-e133-444e-a72f-08dc6156e9f3"),
    teamOption("Lydia", "b7d93f26-e409-4410-88b4-23682126988b"),
    teamOption("Metanoia", "862e13df-dac1-41b1-89a7-8783e7681f88"),
    teamOption("Minerva", "6ad73cfa-d99d-447a-ae5f-1e2be36f2594"),
    teamOption("Monica"),
    teamOption("Nemesia"),
    teamOption("Nerina", "c6370c05-fdc8-428b-90dd-1e313cca17b9"),
    teamOption("Olympus", "7b3aa1b4-e133-444e-a72f-08dc6156e9f3"),
    teamOption("Pieke", "f70a2efb-ea3f-4595-bb3a-a03d33eb87ff"),
    teamOption("Serruria"),
    teamOption("Silene", "862e13df-dac1-41b1-89a7-8783e7681f88"),
    teamOption("Sonop", "79f344b4-977b-4460-b512-8ee468a591b3"),
    teamOption("Venustia", "b7d93f26-e409-4410-88b4-23682126988b"),
    teamOption("Valkyries", "abf01658-1261-475b-90a6-c4614a6ce49d"),
  ];

  const HEADER_CANDIDATES = {
    timestamp: ["timestamp"],
    email: ["email address", "email"],
    fullName: ["name and surname", "full name", "name surname"],
    studentNumber: ["student number", "student no", "student number/employee number"],
    phoneNumber: ["phone number", "phone", "cellphone number", "cell number"],
    birthday: ["birth day", "birthday", "date of birth", "dob"],
    gender: ["gender", "sex"],
    primaryTeam: ["who will you be playing for"],
    secondaryTeam: ["who will you be playing for 2", "who will you be playing for 2?", "who will you be playing for_2"],
  };
  const FIXED_HEADER_INDEXES = {
    timestamp: 0,
    email: 1,
    fullName: 2,
    studentNumber: 3,
    phoneNumber: 4,
    birthday: 5,
    gender: 6,
    primaryTeam: 7,
    secondaryTeam: 8,
  };

  const emptyState = {
    lastSuccessfulRunAt: "",
    lastProcessedSignupTimestamp: "",
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeHeaderName(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeName(value) {
    return normalizeText(value).toLowerCase();
  }

  function normalizeTeamName(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\//g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeGender(value) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return null;
    if (["m", "male", "man", "men"].includes(normalized)) return "M";
    if (["w", "f", "female", "woman", "women", "lady", "ladies"].includes(normalized)) {
      return "W";
    }
    return null;
  }

  function normalizeGoogleSheetsCsvUrl(rawUrl) {
    const value = normalizeText(rawUrl);
    if (!value) return "";

    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();

      if (!host.includes("google") || !url.pathname.includes("/spreadsheets/")) {
        return url.toString();
      }

      const gid = normalizeText(url.searchParams.get("gid"));
      const isPublishedPath = /\/spreadsheets\/d\/e\/.+\/pub(?:html)?$/i.test(url.pathname);
      const isEditablePath = /\/spreadsheets\/d\/[^/]+\/(?:edit|view)$/i.test(url.pathname);
      const isExportPath = /\/spreadsheets\/d\/[^/]+\/export$/i.test(url.pathname);

      if (isPublishedPath) {
        url.pathname = url.pathname.replace(/\/pubhtml$/i, "/pub");
        url.searchParams.set("output", "csv");
        if (gid) {
          url.searchParams.set("gid", gid);
        }
        if (!url.searchParams.has("single")) {
          url.searchParams.set("single", "true");
        }
        return url.toString();
      }

      if (isEditablePath || isExportPath) {
        url.pathname = url.pathname.replace(/\/(?:edit|view)$/i, "/export");
        url.searchParams.set("format", "csv");
        if (gid) {
          url.searchParams.set("gid", gid);
        }
        return url.toString();
      }

      return url.toString();
    } catch {
      return value;
    }
  }

  function looksLikeHtmlDocument(value) {
    const text = String(value || "").trim().toLowerCase();
    return (
      text.startsWith("<!doctype html") ||
      text.startsWith("<html") ||
      text.includes("<head") ||
      text.includes("<body")
    );
  }

  function readStorageValue(storageKey) {
    if (typeof window === "undefined" || !window.localStorage) {
      return "";
    }

    try {
      return window.localStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  }

  function readStorageJson(storageKey, fallbackValue) {
    const rawValue = readStorageValue(storageKey);
    if (!rawValue) return fallbackValue;

    try {
      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed === "object" ? parsed : fallbackValue;
    } catch {
      return fallbackValue;
    }
  }

  function writeStorageJson(storageKey, value) {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore local storage write failures; the import can still complete.
    }
  }

  function detectHeader(headers, candidates) {
    const normalizedCandidates = new Set(
      (candidates || []).map((candidate) => normalizeHeaderName(candidate)),
    );
    return headers.find((header) => normalizedCandidates.has(normalizeHeaderName(header))) || "";
  }

  function createUniqueHeaders(rawHeaders) {
    const seen = new Map();
    return rawHeaders.map((header, index) => {
      const base = normalizeText(header).replace(/\s+/g, " ") || `column_${index + 1}`;
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      return count === 1 ? base : `${base}_${count}`;
    });
  }

  function parseDelimitedRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (inQuotes) {
        if (char === "\"") {
          if (text[index + 1] === "\"") {
            field += "\"";
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === "\"") {
        inQuotes = true;
        continue;
      }

      if (char === delimiter) {
        row.push(field);
        field = "";
        continue;
      }

      if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      if (char === "\r") {
        continue;
      }

      field += char;
    }

    row.push(field);
    if (row.length > 1 || row.some((cell) => normalizeText(cell) !== "")) {
      rows.push(row);
    }

    return rows;
  }

  function parseCsvText(rawText) {
    const text = String(rawText || "").replace(/^\uFEFF/, "");
    const commaRows = parseDelimitedRows(text, ",");
    const semicolonRows =
      commaRows.length > 0 && commaRows[0].length <= 1 && text.includes(";")
        ? parseDelimitedRows(text, ";")
        : [];
    const rows = semicolonRows.length > commaRows.length ? semicolonRows : commaRows;

    if (!rows.length) {
      return { headers: [], rows: [] };
    }

    const headers = createUniqueHeaders(rows[0]);
    const mappedRows = rows
      .slice(1)
      .filter((values) => values.some((value) => normalizeText(value) !== ""))
      .map((values) => {
        const entry = {};
        headers.forEach((header, index) => {
          entry[header] = normalizeText(values[index]);
        });
        return entry;
      });

    return { headers, rows: mappedRows };
  }

  function isValidDate(year, month, day) {
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const test = new Date(Date.UTC(year, month - 1, day));
    return (
      test.getUTCFullYear() === year &&
      test.getUTCMonth() === month - 1 &&
      test.getUTCDate() === day
    );
  }

  function toIsoDate(value, slashDateMode = "auto") {
    const raw = normalizeText(value);
    if (!raw) return "";

    const directIso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (directIso) {
      const year = Number(directIso[1]);
      const month = Number(directIso[2]);
      const day = Number(directIso[3]);
      if (isValidDate(year, month, day)) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    const dottedOrSlashed = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (dottedOrSlashed) {
      const first = Number(dottedOrSlashed[1]);
      const second = Number(dottedOrSlashed[2]);
      const year = Number(dottedOrSlashed[3]);
      let mode = slashDateMode;

      if (mode === "auto") {
        if (first > 12 && second <= 12) {
          mode = "dmy";
        } else if (second > 12 && first <= 12) {
          mode = "mdy";
        } else {
          mode = "dmy";
        }
      }

      const month = mode === "dmy" ? second : first;
      const day = mode === "dmy" ? first : second;

      if (isValidDate(year, month, day)) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return "";
  }

  function toIsoTimestamp(value, slashDateMode = "dmy") {
    const raw = normalizeText(value);
    if (!raw) return "";

    const match = raw.match(
      /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );

    if (match) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const year = Number(match[3]);
      let mode = slashDateMode;

      if (mode === "auto") {
        if (first > 12 && second <= 12) {
          mode = "dmy";
        } else if (second > 12 && first <= 12) {
          mode = "mdy";
        } else {
          mode = "dmy";
        }
      }

      const month = mode === "dmy" ? second : first;
      const day = mode === "dmy" ? first : second;
      const hour = Number(match[4] || 0);
      const minute = Number(match[5] || 0);
      const secondValue = Number(match[6] || 0);

      if (isValidDate(year, month, day)) {
        return new Date(
          Date.UTC(year, month - 1, day, hour, minute, secondValue),
        ).toISOString();
      }
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    return "";
  }

  function uniqueValues(values) {
    return Array.from(
      new Set(
        (values || [])
          .map((value) => normalizeText(value))
          .filter((value) => value.length > 0),
      ),
    );
  }

  function makePlayerKey(name, birthday) {
    const normalizedName = normalizeName(name);
    const normalizedBirthday = normalizeText(birthday);
    if (!normalizedName || !normalizedBirthday) {
      return "";
    }
    return `${normalizedName}::${normalizedBirthday}`;
  }

  function buildSignupDescription(signup) {
    return [
      SIGNUP_DESCRIPTION_PREFIX,
      `Timestamp: ${signup.timestamp || "-"}`,
      `Email: ${signup.email || "-"}`,
      `Student number: ${signup.studentNumber || "-"}`,
      `Phone number: ${signup.phoneNumber || "-"}`,
      `Primary team: ${signup.primaryTeam || "-"}`,
      `Team choices: ${formatChoiceList(signup.teamChoices)}`,
    ].join("\n");
  }

  function formatChoiceList(values) {
    const list = uniqueValues(values);
    return list.length ? list.join(", ") : "-";
  }

  function buildNormalizedOptionSet(values) {
    return new Set((values || []).map((value) => normalizeTeamName(value)).filter(Boolean));
  }

  function buildOptionConfigMap(options) {
    const map = new Map();
    (options || []).forEach((option) => {
      const normalizedName = normalizeTeamName(option?.name);
      if (!normalizedName) return;
      map.set(normalizedName, {
        name: option.name,
        teamIds: Array.isArray(option.teamIds) ? option.teamIds.filter(Boolean) : [],
      });
    });
    return map;
  }

  function getResolvedHeaders(headers) {
    return Object.fromEntries(
      Object.keys(FIXED_HEADER_INDEXES).map((key) => {
        const fixedHeader = headers[FIXED_HEADER_INDEXES[key]] || "";
        if (fixedHeader) {
          return [key, fixedHeader];
        }

        const detectedHeader = detectHeader(headers, HEADER_CANDIDATES[key] || []);
        return [key, detectedHeader];
      }),
    );
  }

  function getRowValue(row, resolvedHeaders, key) {
    const header = resolvedHeaders[key];
    return header ? normalizeText(row[header]) : "";
  }

  function buildSignupFromRow(row, resolvedHeaders) {
    const teamChoices = uniqueValues([
      getRowValue(row, resolvedHeaders, "primaryTeam"),
      getRowValue(row, resolvedHeaders, "secondaryTeam"),
    ]);

    return {
      timestamp: getRowValue(row, resolvedHeaders, "timestamp"),
      email: getRowValue(row, resolvedHeaders, "email"),
      studentNumber: getRowValue(row, resolvedHeaders, "studentNumber"),
      phoneNumber: getRowValue(row, resolvedHeaders, "phoneNumber"),
      primaryTeam: teamChoices[0] || "",
      secondaryTeam: teamChoices[1] || "",
      teamChoices,
    };
  }

  function formatTimestampForLog(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return "never";
    }
    return date.toISOString();
  }

  const activeEventId = context.eventId || EXPECTED_EVENT_ID;
  if (activeEventId !== EXPECTED_EVENT_ID) {
    throw new Error(
      `STB_RL_26_update_rosters only supports ${EXPECTED_EVENT_ID}. Received ${activeEventId}.`,
    );
  }

  const storedCsvUrl = normalizeGoogleSheetsCsvUrl(readStorageValue(SIGNUP_CSV_URL_STORAGE_KEY));
  const storedDobMode = normalizeText(readStorageValue(SIGNUP_DOB_MODE_STORAGE_KEY)).toLowerCase();
  const bundledCsvUrl = normalizeGoogleSheetsCsvUrl(CSV_URL);
  const csvUrl = normalizeGoogleSheetsCsvUrl(context.csvUrl || storedCsvUrl || bundledCsvUrl);
  const dobMode =
    ["auto", "dmy", "mdy"].includes(storedDobMode) ? storedDobMode : DEFAULT_DOB_MODE;
  const scriptState = readStorageJson(SCRIPT_STATE_STORAGE_KEY, emptyState);
  const lastSuccessfulRunAt = normalizeText(scriptState.lastSuccessfulRunAt);
  const forceFullSync = Boolean(
    context.forceFullSync || context.ignoreRecentRunFilter || context.processAllRows,
  );
  const baselineTimestamp = forceFullSync ? "" : lastSuccessfulRunAt || "";
  const baselineMs = baselineTimestamp ? Date.parse(baselineTimestamp) : Number.NaN;
  const runStartedAt = new Date().toISOString();

  if (!csvUrl) {
    throw new Error(
      "No signup CSV URL configured. Set it in Signup management or assign CSV_URL inside STB_RL_26_update_rosters.js.",
    );
  }

  log(
    `Running roster sync ${SCRIPT_VERSION} for ${activeEventId}. Trigger: ${context.trigger || "manual"}. CSV: ${csvUrl}`,
  );
  log(`Last successful update: ${formatTimestampForLog(lastSuccessfulRunAt)}.`);
  if (forceFullSync) {
    log("Full sync mode enabled. Ignoring the recent-run filter and processing all CSV rows.");
  }

  async function fetchCsvText(targetUrl) {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "text/csv,text/plain,*/*" },
    });

    if (!response.ok) {
      throw new Error(`Unable to fetch signup CSV (${response.status}).`);
    }

    return {
      text: await response.text(),
      contentType: response.headers.get("content-type") || "",
      finalUrl: response.url || targetUrl,
    };
  }

  let fetchedCsv = await fetchCsvText(csvUrl);

  if (looksLikeHtmlDocument(fetchedCsv.text) && bundledCsvUrl && bundledCsvUrl !== csvUrl) {
    log(
      `Configured CSV URL returned HTML instead of CSV. Retrying with bundled CSV URL: ${bundledCsvUrl}.`,
    );
    fetchedCsv = await fetchCsvText(bundledCsvUrl);
  }

  if (looksLikeHtmlDocument(fetchedCsv.text)) {
    throw new Error(
      `Signup CSV URL returned HTML instead of CSV. Requested: ${csvUrl}. Final: ${fetchedCsv.finalUrl}. ` +
        `Content-Type: ${fetchedCsv.contentType || "unknown"}.`,
    );
  }

  const csvText = fetchedCsv.text;
  const parsed = parseCsvText(csvText);

  if (!parsed.headers.length) {
    throw new Error("Signup CSV appears to be empty.");
  }

  if (!parsed.rows.length) {
    throw new Error("Signup CSV has no data rows.");
  }

  const resolvedHeaders = getResolvedHeaders(parsed.headers);

  const requiredHeaders = ["fullName", "birthday", "primaryTeam"];
  const missingHeaders = requiredHeaders.filter((key) => !resolvedHeaders[key]);
  if (missingHeaders.length) {
    throw new Error(
      `[${SCRIPT_VERSION}] Signup CSV mapping failed. Missing: ${missingHeaders.join(", ")}. ` +
        `Headers: ${parsed.headers.join(" | ")}. ` +
        `Resolved: ${JSON.stringify(resolvedHeaders)}.`,
    );
  }

  const rowsWithMetadata = parsed.rows.map((row) => {
    const signupTimestamp = resolvedHeaders.timestamp
      ? toIsoTimestamp(row[resolvedHeaders.timestamp], "dmy")
      : "";
    return {
      row,
      signupTimestamp,
      signupTimestampMs: signupTimestamp ? Date.parse(signupTimestamp) : Number.NaN,
    };
  });

  const eligibleRows = rowsWithMetadata.filter((entry) => {
    if (!baselineTimestamp || Number.isNaN(baselineMs)) {
      return true;
    }
    if (!entry.signupTimestamp || Number.isNaN(entry.signupTimestampMs)) {
      return false;
    }
    return entry.signupTimestampMs > baselineMs;
  });

  if (baselineTimestamp) {
    log(
      `Only processing entries newer than ${formatTimestampForLog(baselineTimestamp)}. ${eligibleRows.length} row(s) qualify.`,
    );
  } else {
    log(`No previous successful run found. Processing all ${eligibleRows.length} signup row(s).`);
  }

  const hierarchy = await helpers.getEventHierarchy(activeEventId);
  if (!hierarchy) {
    throw new Error(`No event hierarchy found for ${activeEventId}.`);
  }

  const flattenedTeams = [];
  for (const division of hierarchy.divisions || []) {
    for (const pool of division.pools || []) {
      for (const entry of pool.teams || []) {
        if (!entry?.team?.id) continue;
        flattenedTeams.push(entry.team);
      }
    }
  }

  const uniqueTeamsById = new Map();
  flattenedTeams.forEach((team) => {
    if (!team?.id || uniqueTeamsById.has(team.id)) return;
    uniqueTeamsById.set(team.id, team);
  });

  const teamIndex = new Map();
  const registerTeamKey = (label, team) => {
    const key = normalizeTeamName(label);
    if (!key || !team?.id) return;
    const bucket = teamIndex.get(key) || [];
    if (!bucket.some((entry) => entry.id === team.id)) {
      bucket.push(team);
    }
    teamIndex.set(key, bucket);
  };

  uniqueTeamsById.forEach((team) => {
    registerTeamKey(team.name, team);
    registerTeamKey(team.short_name, team);
  });

  function resolveEventTeamByName(teamName) {
    const normalizedTarget = normalizeTeamName(teamName);
    const matches = teamIndex.get(normalizedTarget) || [];
    return matches.length === 1 ? matches[0] : null;
  }

  const normalizedPrimaryOptions = buildNormalizedOptionSet(
    PRIMARY_TEAM_OPTIONS.map((option) => option.name),
  );
  const normalizedSecondaryOptions = buildNormalizedOptionSet(
    SECONDARY_TEAM_OPTIONS.map((option) => option.name),
  );
  const primaryOptionConfigMap = buildOptionConfigMap(PRIMARY_TEAM_OPTIONS);
  const secondaryOptionConfigMap = buildOptionConfigMap(SECONDARY_TEAM_OPTIONS);
  const fallbackPrimaryTeam = resolveEventTeamByName("Barbarians");
  const fallbackSecondaryTeam =
    resolveEventTeamByName("Valkyries (CSCs + unaffiliated)") ||
    resolveEventTeamByName("Valkyries");

  const resolveTeamChoice = (rawChoice) => {
    const normalizedChoice = normalizeTeamName(rawChoice);
    if (!normalizedChoice) return null;

    const direct = teamIndex.get(normalizedChoice) || [];
    if (direct.length === 1) {
      return direct[0];
    }

    const fuzzyMatches = [];
    teamIndex.forEach((teams, key) => {
      if (key.includes(normalizedChoice) || normalizedChoice.includes(key)) {
        teams.forEach((team) => {
          if (!fuzzyMatches.some((entry) => entry.id === team.id)) {
            fuzzyMatches.push(team);
          }
        });
      }
    });

    return fuzzyMatches.length === 1 ? fuzzyMatches[0] : null;
  };

  const resolveConfiguredTeamChoice = (rawChoice, preference) => {
    const normalizedChoice = normalizeTeamName(rawChoice);
    if (!normalizedChoice) return null;

    const configMap =
      preference === "secondary" ? secondaryOptionConfigMap : primaryOptionConfigMap;
    const optionConfig = configMap.get(normalizedChoice) || null;

    if (!optionConfig) {
      const directTeam = resolveTeamChoice(rawChoice);
      if (!directTeam?.id) return null;
      return {
        teams: [directTeam],
        usedFallback: false,
      };
    }

    const candidateTeams = optionConfig.teamIds
      .map((teamId) => uniqueTeamsById.get(teamId) || null)
      .filter(Boolean);

    if (candidateTeams.length > 0) {
      return {
        teams: candidateTeams,
        usedFallback: false,
      };
    }

    return null;
  };

  const resolveTeamChoiceWithFallback = (rawChoice, preference) => {
    const normalizedChoice = normalizeTeamName(rawChoice);
    if (!normalizedChoice) return null;

    const configuredTeam = resolveConfiguredTeamChoice(rawChoice, preference);
    if (configuredTeam?.teams?.length) {
      return configuredTeam;
    }

    const optionSet =
      preference === "secondary" ? normalizedSecondaryOptions : normalizedPrimaryOptions;
    const fallbackTeam =
      preference === "secondary" ? fallbackSecondaryTeam : fallbackPrimaryTeam;

    if (optionSet.has(normalizedChoice) && fallbackTeam?.id) {
      return {
        teams: [fallbackTeam],
        usedFallback: true,
      };
    }

    return null;
  };

  const { data: playerRows, error: playerError } = await supabase
    .from("player")
    .select("id, name, gender_code, birthday, description")
    .order("name", { ascending: true });

  if (playerError) {
    throw new Error(playerError.message || "Unable to load existing players.");
  }

  const playersByKey = new Map();
  for (const player of playerRows || []) {
    const playerKey = makePlayerKey(player?.name, player?.birthday);
    if (!playerKey) continue;
    const bucket = playersByKey.get(playerKey) || [];
    bucket.push(player);
    playersByKey.set(playerKey, bucket);
  }

  const getOrCreatePlayerFromSignup = async ({ fullName, birthday, genderCode, signup, summary }) => {
    const playerKey = makePlayerKey(fullName, birthday);
    const matchingPlayers = playersByKey.get(playerKey) || [];
    let player = matchingPlayers[0] || null;

    if (matchingPlayers.length > 1 && !duplicatePlayerKeysLogged.has(playerKey)) {
      duplicatePlayerKeysLogged.add(playerKey);
      summary.duplicatePlayerKeysDetected += 1;
      log(`Duplicate player rows already exist for ${fullName} (${birthday}). Using ${player?.id}.`);
    }

    if (!player) {
      const description = buildSignupDescription(signup);
      const { data: createdPlayer, error: createPlayerError } = await supabase
        .from("player")
        .insert({
          name: fullName,
          gender_code: genderCode,
          birthday,
          description,
        })
        .select("id, name, gender_code, birthday, description")
        .single();

      if (createPlayerError) {
        throw new Error(createPlayerError.message || `Unable to create player row for ${fullName}.`);
      }

      player = createdPlayer;
      playersByKey.set(playerKey, [player]);
      summary.playersCreated += 1;
      return player;
    }

    const playerUpdates = {};
    const managedDescription =
      !player.description || String(player.description).startsWith(SIGNUP_DESCRIPTION_PREFIX);
    const nextDescription = buildSignupDescription(signup);

    if (!player.gender_code && genderCode) {
      playerUpdates.gender_code = genderCode;
    }
    if (managedDescription && player.description !== nextDescription) {
      playerUpdates.description = nextDescription;
    }

    if (Object.keys(playerUpdates).length === 0) {
      return player;
    }

    const { data: updatedPlayer, error: updatePlayerError } = await supabase
      .from("player")
      .update(playerUpdates)
      .eq("id", player.id)
      .select("id, name, gender_code, birthday, description")
      .single();

    if (updatePlayerError) {
      throw new Error(updatePlayerError.message || `Unable to update player row for ${fullName}.`);
    }

    player = updatedPlayer;
    playersByKey.set(playerKey, [player]);
    summary.playersUpdated += 1;
    return player;
  };

  const { data: rosterRows, error: rosterError } = await supabase
    .from("team_roster")
    .select("id, team_id, player_id")
    .eq("event_id", activeEventId);

  if (rosterError) {
    throw new Error(rosterError.message || "Unable to load existing roster rows.");
  }

  const rosterKeySet = new Set(
    (rosterRows || [])
      .map((row) => {
        if (!row?.team_id || !row?.player_id) return "";
        return `${activeEventId}:${row.team_id}:${row.player_id}`;
      })
      .filter(Boolean),
  );
  const rosterCountByTeamId = new Map();
  const rosterTeamIdsByPlayerId = new Map();
  (rosterRows || []).forEach((row) => {
    if (row?.team_id) {
      rosterCountByTeamId.set(row.team_id, (rosterCountByTeamId.get(row.team_id) || 0) + 1);
    }
    if (row?.player_id && row?.team_id) {
      const bucket = rosterTeamIdsByPlayerId.get(row.player_id) || new Set();
      bucket.add(row.team_id);
      rosterTeamIdsByPlayerId.set(row.player_id, bucket);
    }
  });

  const summary = {
    eventId: activeEventId,
    scriptVersion: SCRIPT_VERSION,
    trigger: context.trigger || "manual",
    forceFullSync,
    csvUrl,
    csvRowCount: parsed.rows.length,
    rowsConsidered: eligibleRows.length,
    rowsSkippedAlreadyImported: Math.max(0, parsed.rows.length - eligibleRows.length),
    rowsSkippedMissingTimestamp: 0,
    playersCreated: 0,
    playersUpdated: 0,
    rosterLinksCreated: 0,
    duplicateRosterLinksSkipped: 0,
    fallbackAssignmentsUsed: 0,
    rowsSkippedMissingName: 0,
    rowsSkippedMissingBirthday: 0,
    rowsWithoutResolvedTeam: 0,
    duplicatePlayerKeysDetected: 0,
    unknownTeamChoices: [],
    previousSuccessfulRunAt: lastSuccessfulRunAt || null,
    previousProcessedSignupTimestamp:
      normalizeText(scriptState.lastProcessedSignupTimestamp) || null,
    lastSuccessfulRunAt: null,
    lastProcessedSignupTimestamp: null,
  };

  const duplicatePlayerKeysLogged = new Set();
  const unknownTeamChoices = new Set();
  let latestProcessedSignupTimestamp = summary.previousProcessedSignupTimestamp || null;

  for (const entry of eligibleRows) {
    const { row, signupTimestamp } = entry;
    const fullName = normalizeText(row[resolvedHeaders.fullName]);
    const birthday = toIsoDate(row[resolvedHeaders.birthday], dobMode);

    if (!signupTimestamp && baselineTimestamp) {
      summary.rowsSkippedMissingTimestamp += 1;
      continue;
    }

    if (!fullName) {
      summary.rowsSkippedMissingName += 1;
      continue;
    }

    if (!birthday) {
      summary.rowsSkippedMissingBirthday += 1;
      log(`Skipping ${fullName}: invalid or missing birthday.`);
      continue;
    }

    const signup = buildSignupFromRow(row, resolvedHeaders);

    const genderCode = resolvedHeaders.gender ? normalizeGender(row[resolvedHeaders.gender]) : null;
    const player = await getOrCreatePlayerFromSignup({
      fullName,
      birthday,
      genderCode,
      signup,
      summary,
    });

    const resolvedTeams = [];
    const teamChoices = signup.teamChoices;
    const choiceEntries = [
      { choice: signup.primaryTeam, preference: "primary" },
      { choice: signup.secondaryTeam, preference: "secondary" },
    ].filter((item) => normalizeText(item.choice));

    for (const item of choiceEntries) {
      const resolved = resolveTeamChoiceWithFallback(item.choice, item.preference);
      if (!resolved?.teams?.length) {
        unknownTeamChoices.add(item.choice);
        continue;
      }
      resolved.teams.forEach((team) => {
        if (!team?.id) return;
        if (!resolvedTeams.some((teamEntry) => teamEntry.id === team.id)) {
          resolvedTeams.push(team);
        }
      });
      if (resolved.usedFallback) {
        summary.fallbackAssignmentsUsed += 1;
        log(
          `Using ${resolved.teams.map((team) => team.name).join(", ")} as backup team for ${fullName} (${item.preference}: ${item.choice}).`,
        );
      }
    }

    if (!resolvedTeams.length) {
      summary.rowsWithoutResolvedTeam += 1;
      log(`No event team match found for ${fullName}. Choices: ${formatChoiceList(teamChoices)}.`);
      continue;
    }

    for (const team of resolvedTeams) {
      const rosterKey = `${activeEventId}:${team.id}:${player.id}`;
      if (rosterKeySet.has(rosterKey)) {
        summary.duplicateRosterLinksSkipped += 1;
        continue;
      }

      const { error: insertRosterError } = await supabase.from("team_roster").insert({
        event_id: activeEventId,
        team_id: team.id,
        player_id: player.id,
        is_captain: false,
        is_spirit_captain: false,
      });

      if (insertRosterError) {
        throw new Error(
          insertRosterError.message ||
            `Unable to add ${fullName} to ${team.name} for ${activeEventId}.`,
        );
      }

      rosterKeySet.add(rosterKey);
      rosterCountByTeamId.set(team.id, (rosterCountByTeamId.get(team.id) || 0) + 1);
      const assignedTeamIds = rosterTeamIdsByPlayerId.get(player.id) || new Set();
      assignedTeamIds.add(team.id);
      rosterTeamIdsByPlayerId.set(player.id, assignedTeamIds);
      summary.rosterLinksCreated += 1;
    }

    if (signupTimestamp) {
      latestProcessedSignupTimestamp =
        !latestProcessedSignupTimestamp || Date.parse(signupTimestamp) > Date.parse(latestProcessedSignupTimestamp)
          ? signupTimestamp
          : latestProcessedSignupTimestamp;
    }
  }

  summary.unknownTeamChoices = Array.from(unknownTeamChoices).sort((left, right) =>
    left.localeCompare(right),
  );

  const skippedRows =
    summary.rowsSkippedMissingTimestamp +
    summary.rowsSkippedMissingName +
    summary.rowsSkippedMissingBirthday +
    summary.rowsWithoutResolvedTeam;

  const nextScriptState = {
    lastSuccessfulRunAt: runStartedAt,
    lastProcessedSignupTimestamp:
      latestProcessedSignupTimestamp || summary.previousProcessedSignupTimestamp || "",
  };
  writeStorageJson(SCRIPT_STATE_STORAGE_KEY, nextScriptState);

  summary.lastSuccessfulRunAt = nextScriptState.lastSuccessfulRunAt;
  summary.lastProcessedSignupTimestamp = nextScriptState.lastProcessedSignupTimestamp || null;

  const message =
    `Roster sync completed: ${summary.rowsConsidered} new row(s) checked, ` +
    `${summary.playersCreated} players created, ${summary.playersUpdated} players updated, ` +
    `${summary.rosterLinksCreated} roster links added, ${summary.duplicateRosterLinksSkipped} existing roster links skipped, ` +
    `${skippedRows} rows skipped. Last updated: ${summary.lastSuccessfulRunAt}.`;

  log(message);
  if (summary.unknownTeamChoices.length) {
    log(`Unknown team choices: ${summary.unknownTeamChoices.join(", ")}`);
  }

  return {
    status: "completed",
    message,
    ...summary,
  };
};
