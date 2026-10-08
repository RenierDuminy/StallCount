/* eslint-disable react-refresh/only-export-components -- the weather cache helpers are shared with OverlayControlPage */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Open-Meteo is free and keyless. Coordinates come from the match's venue.
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // every 10 min while live
const PREFETCH_LEAD_MS = 10 * 60 * 1000; // begin 10 min before start
// No explicit match end time exists in the schema, so cap the auto-refresh
// window after start as a safety net (finished/completed status stops it too).
const MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;

const FINISHED_STATUSES = new Set(["finished", "completed", "complete", "final", "ended", "done"]);

function isFinishedStatus(...statuses) {
  return statuses.some((status) => FINISHED_STATUSES.has((status || "").toString().trim().toLowerCase()));
}

// WMO weather interpretation codes -> short label + emoji.
const WEATHER_CODES = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Dense drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"],
  57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"],
  63: ["Rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"],
  67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"],
  73: ["Snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"],
  81: ["Rain showers", "🌧️"],
  82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"],
  86: ["Snow showers", "🌨️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm", "⛈️"],
  99: ["Thunderstorm", "⛈️"],
};

export function describeWeatherCode(code) {
  const entry = WEATHER_CODES[code];
  if (!entry) return { label: "--", icon: "🌡️" };
  return { label: entry[0], icon: entry[1] };
}

// A venue is usable only when it carries numeric coordinates.
function getVenueCoords(venue) {
  const latitude = Number(venue?.latitude);
  const longitude = Number(venue?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export function getVenueName(venue) {
  return [venue?.name, venue?.location].filter(Boolean).join(", ");
}

// Build a compact weather summary from cached forecast data for use in banners.
export function summarizeWeather(weather) {
  const current = weather?.current;
  if (!current) return null;
  const units = weather?.current_units || {};
  const daily = weather?.daily || {};
  const code = describeWeatherCode(current.weather_code);
  return {
    icon: code.icon,
    condition: code.label,
    temp: Number.isFinite(current.temperature_2m) ? Math.round(current.temperature_2m) : null,
    tempUnit: units.temperature_2m || "°",
    feelsLike: Number.isFinite(current.apparent_temperature)
      ? Math.round(current.apparent_temperature)
      : null,
    wind: Number.isFinite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) : null,
    windUnit: units.wind_speed_10m || "",
    windGust: Number.isFinite(current.wind_gusts_10m) ? Math.round(current.wind_gusts_10m) : null,
    humidity: Number.isFinite(current.relative_humidity_2m)
      ? Math.round(current.relative_humidity_2m)
      : null,
    rainChance: daily.precipitation_probability_max?.[0] ?? null,
    sunriseMs: daily.sunrise?.[0] ? parseUtcMs(daily.sunrise[0]) : null,
    sunsetMs: daily.sunset?.[0] ? parseUtcMs(daily.sunset[0]) : null,
  };
}

// Per-venue cache in sessionStorage so weather survives reloads and match
// switches within the same session, then clears when the tab closes.
const WEATHER_CACHE_PREFIX = "stallcount:weather:";

function coordsCacheKey(coords) {
  if (!coords) return null;
  return `${WEATHER_CACHE_PREFIX}${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)}`;
}

// Read the session-cached weather for a venue. Exported so the match-status
// banner can bundle the last-fetched weather without re-requesting it.
export function readCachedWeatherForVenue(venue) {
  return readCachedWeather(getVenueCoords(venue));
}

function readCachedWeather(coords) {
  const key = coordsCacheKey(coords);
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.weather ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedWeather(coords, payload) {
  const key = coordsCacheKey(coords);
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / availability failures — cache is best-effort.
  }
}

async function fetchForecast({ latitude, longitude }, signal) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  // Request UTC so hourly/daily timestamps line up with the UTC match start_time.
  // Display converts to CAT (UTC+2) at render time.
  url.searchParams.set("timezone", "UTC");
  // Full data request for now — will be trimmed down later.
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "surface_pressure",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","),
  );
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
    ].join(","),
  );
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "sunrise",
      "sunset",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
    ].join(","),
  );

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Forecast failed (${response.status}).`);
  return response.json();
}

// Number of hourly forecast slots to show, anchored at match start (or now).
const HOURLY_SLOTS = 6;

// All matches are played in Central Africa Time (UTC+2).
const DISPLAY_TZ_OFFSET_HOURS = 2;

// Open-Meteo (requested with timezone=UTC) returns ISO strings without a zone
// suffix, e.g. "2026-07-03T14:00". Parse them as UTC and return epoch ms.
function parseUtcMs(isoString) {
  if (!isoString) return NaN;
  // Append "Z" only when no explicit zone is present.
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(isoString) ? isoString : `${isoString}Z`;
  return new Date(normalized).getTime();
}

// Render an epoch-ms instant as HH:MM in CAT (UTC+2).
function formatCatTime(ms) {
  if (!Number.isFinite(ms)) return "--";
  const shifted = new Date(ms + DISPLAY_TZ_OFFSET_HOURS * 60 * 60 * 1000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Pick the hourly forecast entries starting at the hour of `anchorMs`.
function buildHourlyForecast(hourly, anchorMs) {
  const times = hourly?.time;
  if (!Array.isArray(times) || !times.length) return [];

  const anchor = Number.isFinite(anchorMs) ? anchorMs : Date.now();
  let startIndex = times.findIndex((t) => parseUtcMs(t) >= anchor - 30 * 60 * 1000);
  if (startIndex < 0) startIndex = 0;

  const slots = [];
  for (let i = startIndex; i < times.length && slots.length < HOURLY_SLOTS; i += 1) {
    slots.push({
      timeMs: parseUtcMs(times[i]),
      temp: hourly.temperature_2m?.[i],
      precipProb: hourly.precipitation_probability?.[i],
      windSpeed: hourly.wind_speed_10m?.[i],
      code: hourly.weather_code?.[i],
    });
  }
  return slots;
}

// Degrees -> 16-point compass abbreviation.
const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function windDirectionLabel(deg) {
  if (deg == null || !Number.isFinite(deg)) return "--";
  const index = Math.round(((deg % 360) / 22.5)) % 16;
  return COMPASS_POINTS[index];
}

function StatCell({ label, value }) {
  return (
    <div className="weather-card__stat">
      <span className="weather-card__stat-value">{value}</span>
      <span className="weather-card__stat-label">{label}</span>
    </div>
  );
}

const COLLAPSE_STORAGE_KEY = "stallcount:weather:collapsed";

function readCollapsedPref() {
  try {
    return window.sessionStorage.getItem(COLLAPSE_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function WeatherCard({ venue, startTime, matchStatus, eventStatus }) {
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [collapsed, setCollapsed] = useState(readCollapsedPref);

  const abortRef = useRef(null);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.sessionStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Best-effort persistence.
      }
      return next;
    });
  }, []);

  const finished = isFinishedStatus(matchStatus, eventStatus);
  const coords = useMemo(() => getVenueCoords(venue), [venue]);
  const venueName = getVenueName(venue);
  const hasLocation = Boolean(coords);

  // Tracks whether the latest fetch came from a manual refresh, so an override
  // result stays visible even when the automatic conditions would pause updates.
  const [manualOverride, setManualOverride] = useState(false);

  const load = useCallback(async ({ manual = false } = {}) => {
    if (!coords) {
      setError("No location data available.");
      setStatus("error");
      return;
    }

    if (manual) setManualOverride(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setError("");
    try {
      const data = await fetchForecast(coords, controller.signal);
      if (controller.signal.aborted) return;
      const updatedAt = Date.now();
      setWeather(data);
      setLastUpdated(updatedAt);
      setStatus("ready");
      writeCachedWeather(coords, { weather: data, lastUpdated: updatedAt });
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Unable to load weather.");
      setStatus("error");
    }
  }, [coords]);

  // Automatic fetching: 10 min before start, then every 10 min through the
  // match window. Nothing pulls once the match/event is finished.
  useEffect(() => {
    if (finished || !hasLocation) return undefined;

    const startMs = startTime ? new Date(startTime).getTime() : NaN;
    let cancelled = false;
    let timer = null;

    const tick = () => {
      if (cancelled) return;
      const now = Date.now();
      const hasStart = Number.isFinite(startMs);
      const windowStart = hasStart ? startMs - PREFETCH_LEAD_MS : now;
      const windowEnd = hasStart ? startMs + MATCH_WINDOW_MS : now + MATCH_WINDOW_MS;

      if (now >= windowStart && now <= windowEnd) {
        void load();
        timer = window.setTimeout(tick, REFRESH_INTERVAL_MS);
      } else if (now < windowStart) {
        // Wake up right when the pre-fetch window opens.
        timer = window.setTimeout(tick, Math.max(1000, windowStart - now));
      }
      // Past the window: stop scheduling.
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [finished, hasLocation, startTime, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // On venue change (incl. first mount / reload), hydrate from the session
  // cache so previously fetched weather shows immediately, and reset the
  // per-match manual override.
  useEffect(() => {
    setManualOverride(false);
    const cached = readCachedWeather(coords);
    if (cached) {
      setWeather(cached.weather);
      setLastUpdated(cached.lastUpdated ?? null);
      setStatus("ready");
      setError("");
    } else {
      setWeather(null);
      setLastUpdated(null);
      setStatus("idle");
      setError("");
    }
  }, [coords?.latitude, coords?.longitude]);

  const current = weather?.current;
  const units = weather?.current_units;
  const daily = weather?.daily;
  const dailyUnits = weather?.daily_units;
  const hourlyUnits = weather?.hourly_units;
  const codeInfo = useMemo(
    () => describeWeatherCode(current?.weather_code),
    [current?.weather_code],
  );

  const anchorMs = startTime ? new Date(startTime).getTime() : Date.now();
  const hourlyForecast = useMemo(
    () => buildHourlyForecast(weather?.hourly, anchorMs),
    [weather?.hourly, anchorMs],
  );

  return (
    <div className={`overlay-banner-block weather-card ${collapsed ? "is-collapsed" : "is-expanded"}`}>
      <div className="overlay-banner-block__header">
        <button
          type="button"
          className="weather-card__toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand weather" : "Collapse weather"}
        >
          <span className="weather-card__toggle-caret" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="overlay-banner-block__title">Weather</span>
        </button>
        <button
          type="button"
          className="sc-button is-ghost weather-card__refresh"
          onClick={() => load({ manual: true })}
          disabled={status === "loading" || !hasLocation}
        >
          {status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!hasLocation ? (
        <p className="overlay-banner-status">No location data available.</p>
      ) : finished && !manualOverride ? (
        <p className="overlay-banner-status">Match finished — weather updates paused.</p>
      ) : status === "error" ? (
        <p className="overlay-banner-status overlay-banner-status--error">{error}</p>
      ) : status === "loading" && !current ? (
        <p className="overlay-banner-status">Loading weather…</p>
      ) : current && collapsed ? (
        <div className="weather-card__compact">
          <span className="weather-card__compact-icon" aria-hidden="true">
            {codeInfo.icon}
          </span>
          <StatCell
            label="Feels like"
            value={`${Math.round(current.apparent_temperature)}${units?.apparent_temperature || "°"}`}
          />
          <StatCell
            label="Wind"
            value={`${Math.round(current.wind_speed_10m)}${
              current.wind_gusts_10m != null ? ` (${Math.round(current.wind_gusts_10m)})` : ""
            } ${units?.wind_speed_10m || ""}`.trim()}
          />
          <StatCell
            label="Direction"
            value={`${windDirectionLabel(current.wind_direction_10m)}${
              current.wind_direction_10m != null ? ` · ${Math.round(current.wind_direction_10m)}°` : ""
            }`}
          />
        </div>
      ) : current ? (
        <div className="weather-card__body">
          <div className="weather-card__headline">
            <span className="weather-card__icon" aria-hidden="true">
              {codeInfo.icon}
            </span>
            <div className="weather-card__headline-text">
              <span className="weather-card__temp">
                {Math.round(current.temperature_2m)}
                {units?.temperature_2m || "°"}
              </span>
              <span className="weather-card__condition">{codeInfo.label}</span>
              {venueName ? (
                <span className="weather-card__place">{venueName}</span>
              ) : null}
            </div>
          </div>

          <div className="weather-card__stats">
            <StatCell
              label="Feels like"
              value={`${Math.round(current.apparent_temperature)}${units?.apparent_temperature || "°"}`}
            />
            <StatCell
              label="Wind"
              value={`${Math.round(current.wind_speed_10m)} ${units?.wind_speed_10m || ""}`.trim()}
            />
            <StatCell
              label="Gusts"
              value={`${Math.round(current.wind_gusts_10m)} ${units?.wind_gusts_10m || ""}`.trim()}
            />
            <StatCell
              label="Direction"
              value={`${windDirectionLabel(current.wind_direction_10m)}${
                current.wind_direction_10m != null ? ` · ${Math.round(current.wind_direction_10m)}°` : ""
              }`}
            />
            <StatCell
              label="Humidity"
              value={`${Math.round(current.relative_humidity_2m)}${units?.relative_humidity_2m || "%"}`}
            />
            <StatCell
              label="Precip"
              value={`${current.precipitation ?? 0} ${units?.precipitation || ""}`.trim()}
            />
            {current.rain != null ? (
              <StatCell label="Rain" value={`${current.rain} ${units?.rain || ""}`.trim()} />
            ) : null}
            {current.showers != null ? (
              <StatCell label="Showers" value={`${current.showers} ${units?.showers || ""}`.trim()} />
            ) : null}
            <StatCell label="Cloud" value={`${Math.round(current.cloud_cover)}%`} />
            {daily?.temperature_2m_max?.[0] != null ? (
              <StatCell
                label="High / Low"
                value={`${Math.round(daily.temperature_2m_max[0])}° / ${Math.round(daily.temperature_2m_min[0])}°`}
              />
            ) : null}
            {daily?.precipitation_probability_max?.[0] != null ? (
              <StatCell label="Rain chance" value={`${daily.precipitation_probability_max[0]}%`} />
            ) : null}
          </div>

          {hourlyForecast.length ? (
            <div className="weather-card__forecast">
              <div className="weather-card__section-label">
                {startTime ? "Forecast at match time" : "Hourly forecast"}
              </div>
              <div className="weather-card__hours">
                {hourlyForecast.map((slot) => {
                  const slotCode = describeWeatherCode(slot.code);
                  return (
                    <div className="weather-card__hour" key={slot.timeMs}>
                      <span className="weather-card__hour-time">{formatCatTime(slot.timeMs)}</span>
                      <span className="weather-card__hour-icon" aria-hidden="true">
                        {slotCode.icon}
                      </span>
                      <span className="weather-card__hour-temp">
                        {slot.temp != null ? `${Math.round(slot.temp)}°` : "--"}
                      </span>
                      <span className="weather-card__hour-precip">
                        💧 {slot.precipProb != null ? `${slot.precipProb}%` : "--"}
                      </span>
                      <span className="weather-card__hour-wind">
                        {slot.windSpeed != null
                          ? `${Math.round(slot.windSpeed)} ${hourlyUnits?.wind_speed_10m || ""}`.trim()
                          : "--"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {daily?.time?.length ? (
            <div className="weather-card__daily">
              <div className="weather-card__section-label">Today</div>
              <div className="weather-card__daily-row">
                {daily.temperature_2m_max?.[0] != null ? (
                  <span>
                    High {Math.round(daily.temperature_2m_max[0])}° · Low{" "}
                    {Math.round(daily.temperature_2m_min[0])}°
                  </span>
                ) : null}
                {daily.sunrise?.[0] && daily.sunset?.[0] ? (
                  <span>
                    🌅 {formatCatTime(parseUtcMs(daily.sunrise[0]))} · 🌇{" "}
                    {formatCatTime(parseUtcMs(daily.sunset[0]))}
                  </span>
                ) : null}
                {daily.precipitation_sum?.[0] != null ? (
                  <span>
                    Rain {daily.precipitation_sum[0]}
                    {dailyUnits?.precipitation_sum || " mm"}
                    {daily.precipitation_probability_max?.[0] != null
                      ? ` (${daily.precipitation_probability_max[0]}%)`
                      : ""}
                  </span>
                ) : null}
                {daily.wind_speed_10m_max?.[0] != null ? (
                  <span>
                    Wind max {Math.round(daily.wind_speed_10m_max[0])}
                    {daily.wind_gusts_10m_max?.[0] != null
                      ? ` · gusts ${Math.round(daily.wind_gusts_10m_max[0])}`
                      : ""}{" "}
                    {dailyUnits?.wind_speed_10m_max || ""}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {lastUpdated ? (
            <p className="weather-card__updated">
              Updated {formatCatTime(lastUpdated)} CAT
            </p>
          ) : null}
        </div>
      ) : (
        <p className="overlay-banner-status">Tap refresh to load weather.</p>
      )}
    </div>
  );
}
