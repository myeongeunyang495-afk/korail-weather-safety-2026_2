import { useState, type CSSProperties } from "react";
import { ShareSheet } from "./ShareSheet";
import { getStageMeta, HAZARD_LABEL } from "../data/stageContent";
import { formatObservedAt, formatTemp } from "../lib/format";
import type { HourlyReading } from "../hooks/useReading";
import type { Reading } from "../lib/reading";
import { STAGE_RANK, type HazardKind, type StageLevel } from "../lib/stages";

interface Props {
  reading: Reading | null;
  hourly: HourlyReading[];
  loading: boolean;
  error: string | null;
  onGps: () => void;
  onToggleFav: () => void;
  onOpenSafety: () => void;
  onOpenForecast: (hazard: HazardKind) => void;
  isFav: boolean;
}

const SUMMER_HAZARDS: HazardKind[] = ["heat", "rain"];
const WINTER_HAZARDS: HazardKind[] = ["snow", "cold"];

const HAZARD_STAGE_KEY: Record<HazardKind, keyof Pick<HourlyReading, "heatLevel" | "rainLevel" | "snowLevel" | "coldLevel">> = {
  heat: "heatLevel",
  rain: "rainLevel",
  snow: "snowLevel",
  cold: "coldLevel",
};

type WeatherVisual = "sunny" | "cloudy" | "rain" | "snow" | "heat";

function maxLevel(levels: StageLevel[]): StageLevel {
  return levels.reduce<StageLevel>((max, level) => (STAGE_RANK[level] > STAGE_RANK[max] ? level : max), "normal");
}

function dateShort(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function levelText(hazard: HazardKind, level: StageLevel, date: Date) {
  if (level === "normal") return `${dateShort(date)} 특보 없음`;
  if (level === "interest") return `${dateShort(date)} 관심 예상`;
  return `${dateShort(date)} ${HAZARD_LABEL[hazard]}${level === "danger" ? "경보" : "주의보"} 예상`;
}

function valueText(hazard: HazardKind, reading: Reading, hourly: HourlyReading[]) {
  if (hazard === "heat") {
    const values = [reading.feelsLikeC, ...hourly.map((h) => h.heatFeelsLikeC)].filter(Number.isFinite);
    return `최고 체감온도 ${formatTemp(Math.max(...values))}`;
  }
  if (hazard === "cold") {
    const values = [reading.feelsLikeC, ...hourly.map((h) => h.coldFeelsLikeC)].filter(Number.isFinite);
    return `최저 체감온도 ${formatTemp(Math.min(...values))}`;
  }
  if (hazard === "rain") {
    const values = [reading.rn1mm, ...hourly.map((h) => h.rn1mm)].filter(Number.isFinite);
    const max = Math.max(...values);
    return `최고 강수량 ${max < 10 ? max.toFixed(1) : Math.round(max)}mm`;
  }
  const values = [reading.primaryHazard === "snow" ? reading.rn1mm : 0, ...hourly.map((h) => h.rn1mm)].filter(Number.isFinite);
  const max = Math.max(...values);
  return `최고 적설량 ${max < 10 ? max.toFixed(1) : Math.round(max)}cm`;
}

function getOperationalSeason(date: Date) {
  const month = date.getMonth() + 1;
  return month >= 11 || month <= 3 ? "winter" : "summer";
}

function WeatherFocus({ reading, hourly, onOpenSafety, onOpenForecast }: { reading: Reading; hourly: HourlyReading[]; onOpenSafety: () => void; onOpenForecast: (hazard: HazardKind) => void }) {
  const season = getOperationalSeason(reading.observedAt);
  const focusHazards = season === "winter" ? WINTER_HAZARDS : SUMMER_HAZARDS;
  const seasonText = season === "winter" ? "11월~3월 겨울 중점" : "4월~10월 여름 중점";

  const summaryFor = (hazard: HazardKind) => {
    const currentLevel = reading.primaryHazard === hazard ? reading.primaryLevel : "normal";
    const forecastItems = hourly.map((h) => ({ time: h.time, level: h[HAZARD_STAGE_KEY[hazard]] as StageLevel }));
    const level = maxLevel([currentLevel, ...forecastItems.map((item) => item.level)]);
    const date =
      level !== "normal"
        ? forecastItems.find((item) => item.level === level)?.time ?? reading.observedAt
        : reading.observedAt;
    return { level, date };
  };

  return (
    <div className="weather-focus">
      <div className="weather-focus__main">
        <span className="weather-focus__kicker">직원 중점 확인</span>
        <strong>{seasonText}: {focusHazards.map((hazard) => HAZARD_LABEL[hazard]).join(" · ")}</strong>
        <span>기상청 실황·예보의 하루 중 최고/최저 값으로 안전·관심·주의보·경보 단계를 표시합니다.</span>
      </div>
      <div className="weather-focus__chips" aria-label="예보 기반 위험 현황">
        {focusHazards.map((hazard) => {
          const { level, date } = summaryFor(hazard);
          const meta = getStageMeta(hazard, level);
          return (
            <button key={hazard} className={`weather-focus__chip level-${level}`} style={{ "--stage": meta.color } as CSSProperties} onClick={() => onOpenForecast(hazard)}>
              <b>{HAZARD_LABEL[hazard]}</b>
              <span>{levelText(hazard, level, date)}</span>
              <em>{valueText(hazard, reading, hourly)}</em>
              <small>{level === "normal" ? "안전" : level === "interest" ? "관심" : level === "warning" ? "주의보" : "경보"}</small>
            </button>
          );
        })}
      </div>
      <button className="weather-focus__guide" onClick={onOpenSafety}>
        위험별 조치사항은 안전가이드에서 보기
      </button>
    </div>
  );
}

function isRainPty(pty: number) {
  return [1, 2, 5, 6].includes(pty);
}

function isSnowPty(pty: number) {
  return [2, 3, 6, 7].includes(pty);
}

function nearestSky(hourly: HourlyReading[]) {
  return hourly.find((h) => Number.isFinite(h.sky))?.sky;
}

function getWeatherVisual(reading: Reading, hourly: HourlyReading[]): WeatherVisual {
  if (isSnowPty(reading.pty) || reading.primaryHazard === "snow") return "snow";
  if (reading.rn1mm > 0 || isRainPty(reading.pty) || (reading.primaryHazard === "rain" && reading.primaryLevel !== "normal")) return "rain";
  if (reading.primaryHazard === "heat" && reading.primaryLevel !== "normal") return "heat";
  const sky = nearestSky(hourly);
  if (sky === 3 || sky === 4) return "cloudy";
  return "sunny";
}

function weatherLabel(kind: WeatherVisual) {
  if (kind === "rain") return "비";
  if (kind === "snow") return "눈";
  if (kind === "heat") return "폭염";
  if (kind === "cloudy") return "흐림";
  return "맑음";
}

function WeatherConditionIcon({ kind }: { kind: WeatherVisual }) {
  const showSun = kind === "sunny" || kind === "heat";
  const showCloud = kind === "cloudy" || kind === "rain" || kind === "snow";
  return (
    <svg className={`weather-icon weather-icon--${kind}`} viewBox="0 0 96 96" role="img" aria-label={weatherLabel(kind)}>
      {showSun && (
        <g className="weather-icon__sun">
          <circle cx="48" cy="43" r={kind === "heat" ? 22 : 18} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="48" y1="10" x2="48" y2="0" transform={`rotate(${a} 48 48)`} />
          ))}
        </g>
      )}
      {showCloud && (
        <g className="weather-icon__cloud">
          <ellipse cx="42" cy="52" rx="23" ry="15" />
          <circle cx="31" cy="48" r="13" />
          <circle cx="49" cy="41" r="18" />
          <circle cx="64" cy="52" r="14" />
          <rect x="25" y="52" width="51" height="16" rx="8" />
        </g>
      )}
      {kind === "rain" && (
        <g className="weather-icon__rain">
          <line x1="34" y1="75" x2="30" y2="86" />
          <line x1="49" y1="75" x2="45" y2="88" />
          <line x1="64" y1="75" x2="60" y2="86" />
        </g>
      )}
      {kind === "snow" && (
        <g className="weather-icon__snow">
          {[34, 50, 66].map((x) => (
            <g key={x} transform={`translate(${x} 82)`}>
              <line x1="-5" y1="0" x2="5" y2="0" />
              <line x1="0" y1="-5" x2="0" y2="5" />
              <line x1="-4" y1="-4" x2="4" y2="4" />
              <line x1="-4" y1="4" x2="4" y2="-4" />
            </g>
          ))}
        </g>
      )}
      {kind === "sunny" && <path className="weather-icon__small-cloud" d="M52 67h24a8 8 0 0 0 0-16 12 12 0 0 0-22-5 10 10 0 0 0-2 21Z" />}
    </svg>
  );
}

export function CurrentCard({ reading, hourly, loading, error, onGps, onToggleFav, onOpenSafety, onOpenForecast, isFav }: Props) {
  const [share, setShare] = useState(false);
  const meta = reading ? getStageMeta(reading.primaryHazard, reading.primaryLevel) : null;
  const isRain = reading?.primaryHazard === "rain";
  const isSnow = reading?.primaryHazard === "snow";
  const isPrecip = isRain || isSnow;
  const weatherVisual = reading ? getWeatherVisual(reading, hourly) : "sunny";
  const amountText = reading
    ? reading.rn1mm < 10
      ? reading.rn1mm.toFixed(1)
      : String(Math.round(reading.rn1mm))
    : "0";
  const amountUnit = isSnow ? "cm" : "mm";
  const amountCap = isSnow ? "시간당 적설량" : "시간당 강수량";

  return (
    <section className="current" style={meta ? ({ "--stage": meta.color } as CSSProperties) : undefined}>
      <button className="btn btn--gps" onClick={onGps} disabled={loading}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
        {loading ? "위치·날씨 분석 중…" : "내 위치 실시간 조회"}
      </button>
      <p className="privacy-note">※ 위치 조회만 사용하며 별도 정보는 가져가지 않습니다.</p>

      {error && <p className="current__error">{error}</p>}

      {!reading && !error && (
        <div className="current__skeleton" aria-hidden="true">
          <div className="sk sk--num" />
          <div className="sk sk--row" />
          <div className="sk sk--row" />
        </div>
      )}

      {reading && meta && (
        <>
          <div className="current__hero">
            <WeatherConditionIcon kind={weatherVisual} />
            <div className="current__big">
              <div className="current__feel">
                {isPrecip ? (
                  <>
                    {amountText}
                    <span className="current__unit">{amountUnit}</span>
                  </>
                ) : (
                  formatTemp(reading.feelsLikeC)
                )}
              </div>
              <div className="current__feel-cap">{isPrecip ? amountCap : "체감온도"}</div>
              <div className="current__weather-label">{weatherLabel(weatherVisual)}</div>
            </div>
          </div>

          <div className="stagechip" data-level={reading.primaryLevel}>
            <span className="stagechip__emoji">{meta.emoji}</span>
            <b>{meta.label}</b>
            <span className="stagechip__th">{meta.thresholdLabel}</span>
          </div>

          <WeatherFocus reading={reading} hourly={hourly} onOpenSafety={onOpenSafety} onOpenForecast={onOpenForecast} />

          <dl className="current__grid">
            <div><dt>기온</dt><dd>{formatTemp(reading.tempC)}</dd></div>
            <div><dt>습도</dt><dd>{Math.round(reading.humidityPct)}%</dd></div>
            <div>
              <dt>{isPrecip ? "체감온도" : reading.model === "winter" ? "풍속" : "바람"}</dt>
              <dd>{isPrecip ? formatTemp(reading.feelsLikeC) : `${reading.windMs.toFixed(1)}㎧`}</dd>
            </div>
            <div className="current__grid-wide"><dt>현재 지역</dt><dd>{reading.location}</dd></div>
            <div className="current__grid-wide"><dt>조회 시각</dt><dd className="current__time">{formatObservedAt(reading.observedAt)}</dd></div>
          </dl>

          <div className="current__actions">
            <button className={`btn btn--ghost ${isFav ? "is-fav" : ""}`} onClick={onToggleFav}>{isFav ? "★ 즐겨찾기됨" : "☆ 현장 즐겨찾기"}</button>
            <button className="btn btn--ghost" onClick={() => setShare(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M16 6l-4-4-4 4M12 2v13M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              현장 공유
            </button>
          </div>
        </>
      )}

      {share && reading && <ShareSheet reading={reading} onClose={() => setShare(false)} />}
    </section>
  );
}
