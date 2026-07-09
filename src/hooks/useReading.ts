import { useCallback, useRef, useState } from "react";
import { createWeatherProvider } from "../providers";
import { computeReading, type Reading, type ViewMode } from "../lib/reading";
import { computeFeelsLike } from "../lib/feelsLike";
import {
  classifyCold,
  classifyHeat,
  classifyRain,
  classifySnow,
  type HazardKind,
  type StageLevel,
} from "../lib/stages";
import { getBestPosition, reverseGeocode } from "../lib/geolocation";

export type { ViewMode } from "../lib/reading";

export interface WeatherWarning {
  id: string;
  hazard: HazardKind;
  level: "warning" | "danger";
  title: string;
  regions: string[];
  issuedAt?: string | null;
  effectiveAt?: string | null;
  scheduledAt?: string | null;
  text?: string;
}

export interface HourlyReading {
  time: Date;
  tempC: number;
  feelsLikeC: number;
  level: StageLevel;
  heatFeelsLikeC: number;
  heatLevel: StageLevel;
  coldFeelsLikeC: number;
  coldLevel: StageLevel;
  rn1mm: number;
  sky?: number;
  rainLevel: StageLevel;
  snowLevel: StageLevel;
}

interface LastQuery {
  lat: number;
  lon: number;
  label: string;
}

const DEFAULT_LOCATION = { lat: 37.5665, lon: 126.978, label: "\uC11C\uC6B8\uD2B9\uBCC4\uC2DC \uC911\uAD6C (\uAE30\uBCF8 \uC704\uCE58)" };

async function fetchWarnings(): Promise<WeatherWarning[]> {
  const res = await fetch("/api/warnings");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.warnings) ? data.warnings : [];
}

export function useReading() {
  const providerRef = useRef(createWeatherProvider());
  const [reading, setReading] = useState<Reading | null>(null);
  const [hourly, setHourly] = useState<HourlyReading[]>([]);
  const [warnings, setWarnings] = useState<WeatherWarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const last = useRef<LastQuery | null>(null);

  const queryByCoords = useCallback(
    async (lat: number, lon: number, label: string, mode: ViewMode = "auto") => {
      const id = ++reqId.current;
      last.current = { lat, lon, label };
      setLoading(true);
      setError(null);
      try {
        const provider = providerRef.current;
        const now = await provider.getNow(lat, lon);
        if (id !== reqId.current) return;
        const queriedNow = { ...now, observedAt: new Date() };
        const r = computeReading(queriedNow, label, mode);
        setReading(r);
        setHourly([]);

        fetchWarnings()
          .then((items) => {
            if (id === reqId.current) setWarnings(items);
          })
          .catch(() => {
            if (id === reqId.current) setWarnings([]);
          });

        provider
          .getHourly(lat, lon)
          .then((points) => {
            if (id !== reqId.current) return;
            const mapped = points.map<HourlyReading>((p) => {
              const humidityPct = Number.isFinite(p.humidityPct) && p.humidityPct > 0 ? p.humidityPct : r.humidityPct;
              const windMs = Number.isFinite(p.windMs) ? p.windMs : r.windMs;
              const input = { tempC: p.tempC, humidityPct, windMs };
              const feels = computeFeelsLike(input, r.model);
              const heatFeels = computeFeelsLike(input, "summer");
              const coldFeels = computeFeelsLike(input, "winter");
              const heatLevel = classifyHeat(heatFeels);
              const coldLevel = classifyCold(coldFeels);
              const level = r.model === "winter" ? coldLevel : heatLevel;
              const rainLevel = classifyRain({ rn1mm: p.rn1mm, pty: p.pty });
              const snowLevel = classifySnow({ snoCm: p.rn1mm, pty: p.pty });
              return {
                time: p.time,
                tempC: p.tempC,
                feelsLikeC: feels,
                level,
                heatFeelsLikeC: heatFeels,
                heatLevel,
                coldFeelsLikeC: coldFeels,
                coldLevel,
                rn1mm: p.rn1mm,
                sky: p.sky,
                rainLevel,
                snowLevel,
              };
            });
            setHourly(mapped);
          })
          .catch(() => {
            // Forecast failure should not block the current observation view.
          });
      } catch {
        if (id === reqId.current) setError("\uB0A0\uC528 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [],
  );

  const queryByGps = useCallback(
    async (mode: ViewMode = "auto") => {
      setLoading(true);
      setError(null);
      try {
        const { lat, lon } = await getBestPosition();
        const label = await reverseGeocode(lat, lon).catch(() => "\uD604\uC7AC \uC704\uCE58");
        await queryByCoords(lat, lon, label, mode);
      } catch {
        await queryByCoords(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label, mode);
      }
    },
    [queryByCoords],
  );

  const refresh = useCallback(
    (mode: ViewMode = "auto") => {
      if (last.current) {
        const { lat, lon, label } = last.current;
        return queryByCoords(lat, lon, label, mode);
      }
      return queryByGps(mode);
    },
    [queryByCoords, queryByGps],
  );

  return { reading, hourly, warnings, loading, error, queryByCoords, queryByGps, refresh };
}