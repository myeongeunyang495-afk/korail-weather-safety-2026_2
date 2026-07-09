/**
 * Mock 기상 제공자 — API 키 없이 동작하는 합성 데이터.
 *
 * 목적: ① 키 없이 전 기능 데모 ② 오프라인/프록시 실패 시 폴백.
 * 계절(월)·시간대(시)·위치(위도)로 그럴듯한 기온/습도/풍속을 만들고,
 * `?demo=heat|cold|rain|danger|warning|interest` 로 특정 단계를 강제 시연할 수 있다.
 */
import type { HourlyPoint, WeatherNow, WeatherProvider } from "./types";

type DemoMode =
  | "heat"
  | "cold"
  | "rain"
  | "snow"
  | "danger"
  | "warning"
  | "interest"
  | null;

function readDemoMode(): DemoMode {
  if (typeof window === "undefined") return null;
  // 데모는 URL 파라미터(?demo=)가 있을 때만 동작한다.
  // 과거 버전이 localStorage 에 저장해 둔 demoMode 가 있으면 정리(고착 방지).
  try {
    window.localStorage.removeItem("demoMode");
  } catch {
    /* ignore */
  }
  const url = new URLSearchParams(window.location.search).get("demo");
  const valid = ["heat", "cold", "rain", "snow", "danger", "warning", "interest"];
  return valid.includes(url ?? "") ? (url as DemoMode) : null;
}

/** 월별 평균 기온(℃) 대략치 — 한반도 중부 기준 */
const MONTHLY_BASE_TEMP = [1, 3, 8, 15, 20, 24, 27, 28, 23, 16, 9, 2];

/** 위도가 높을수록(북쪽) 약간 더 춥게 보정 */
function latAdjust(lat: number): number {
  return (36.5 - lat) * 0.6;
}

/** 시간대별 일교차 (14시 최고, 새벽 최저) */
function diurnal(hour: number): number {
  return Math.sin(((hour - 9) / 24) * Math.PI * 2) * 4.5;
}

function buildBase(lat: number, date: Date) {
  const month = date.getMonth();
  return MONTHLY_BASE_TEMP[month] + latAdjust(lat);
}

function applyDemo(now: WeatherNow, demo: DemoMode): WeatherNow {
  switch (demo) {
    case "heat":
    case "danger":
      return { ...now, tempC: 36, humidityPct: 65, windMs: 1.2, rn1mm: 0, pty: 0 };
    case "warning":
      return { ...now, tempC: 33, humidityPct: 60, windMs: 1.5, rn1mm: 0, pty: 0 };
    case "interest":
      return { ...now, tempC: 31, humidityPct: 70, windMs: 2, rn1mm: 0, pty: 0 };
    case "cold":
      return { ...now, tempC: -8, humidityPct: 45, windMs: 7, rn1mm: 0, pty: 0 };
    case "rain":
      return { ...now, tempC: 22, humidityPct: 92, windMs: 4, rn1mm: 25, pty: 1 };
    case "snow":
      return { ...now, tempC: -3, humidityPct: 85, windMs: 3, rn1mm: 2, pty: 3 };
    default:
      return now;
  }
}

export function createMockProvider(): WeatherProvider {
  const make = (lat: number, when: Date): WeatherNow => {
    const base = buildBase(lat, when) + diurnal(when.getHours());
    const tempC = Math.round(base * 10) / 10;
    const month = when.getMonth();
    const humidityPct = month >= 5 && month <= 8 ? 68 : 50;
    const now: WeatherNow = {
      tempC,
      humidityPct,
      windMs: 2.0,
      rn1mm: 0,
      pty: 0,
      observedAt: when,
      source: "mock",
    };
    return applyDemo(now, readDemoMode());
  };

  return {
    async getNow(lat) {
      return make(lat, new Date());
    },
    async getHourly(lat) {
      const demo = readDemoMode();
      const out: HourlyPoint[] = [];
      const start = new Date();
      for (let h = 1; h <= 12; h += 1) {
        const when = new Date(start.getTime() + h * 3600_000);
        const n = make(lat, when);
        let rn1mm = n.rn1mm;
        let pty = n.pty;
        if (demo === "rain") {
          // 강수량 산 모양 패턴(피크 후 감소) — 데모용
          rn1mm = Math.round(28 * Math.exp(-((h - 4) ** 2) / 12) * 10) / 10;
          pty = rn1mm >= 0.1 ? 1 : 0;
        } else if (demo === "snow") {
          // 적설량(cm) 산 모양 패턴 — 데모용
          rn1mm = Math.round(3 * Math.exp(-((h - 4) ** 2) / 14) * 10) / 10;
          pty = rn1mm >= 0.1 ? 3 : 0;
        }
        out.push({
          time: when,
          tempC: n.tempC,
          humidityPct: n.humidityPct,
          windMs: n.windMs,
          pty,
          rn1mm,
        });
      }
      return out;
    },
  };
}
