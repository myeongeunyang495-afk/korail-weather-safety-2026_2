import { useState, type CSSProperties } from "react";
import { Thermometer } from "./Thermometer";
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
    return { level, date, active: level !== "normal" };
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

function RainDrop({ color }: { color: string }) {
  return (
    <svg className="thermo" width="44" height="96" viewBox="0 0 44 96" aria-hidden="true">
      <path d="M22 18 C22 18 38 46 38 63 a16 16 0 1 1 -32 0 C6 46 22 18 22 18 Z" fill={color} opacity="0.16" />
      <path d="M22 30 C22 30 33 50 33 64 a11 11 0 1 1 -22 0 C11 50 22 30 22 30 Z" fill={color} style={{ transition: "fill var(--dur)" }} />
      <path d="M16.5 62 a5.5 5.5 0 0 0 4 4.6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

function SnowFlake({ color }: { color: string }) {
  return (
    <svg className="thermo" width="44" height="96" viewBox="0 0 44 96" aria-hidden="true">
      <g stroke={color} strokeWidth="3" strokeLinecap="round" transform="translate(22,48)" style={{ transition: "stroke var(--dur)" }}>
        {[0, 60, 120].map((a) => (
          <line key={a} x1="0" y1="-21" x2="0" y2="21" transform={`rotate(${a})`} />
        ))}
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <line x1="0" y1="-21" x2="-6" y2="-14" />
            <line x1="0" y1="-21" x2="6" y2="-14" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function CurrentCard({ reading, hourly, loading, error, onGps, onToggleFav, onOpenSafety, onOpenForecast, isFav }: Props) {
  const [share, setShare] = useState(false);
  const meta = reading ? getStageMeta(reading.primaryHazard, reading.primaryLevel) : null;
  const isRain = reading?.primaryHazard === "rain";
  const isSnow = reading?.primaryHazard === "snow";
  const isPrecip = isRain || isSnow;
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
            {isSnow ? <SnowFlake color={meta.color} /> : isRain ? <RainDrop color={meta.color} /> : <Thermometer color={meta.color} feelsLikeC={reading.feelsLikeC} />}
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







