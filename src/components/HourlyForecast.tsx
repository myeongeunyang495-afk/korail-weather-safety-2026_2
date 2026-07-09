import { type CSSProperties } from "react";
import type { HourlyReading } from "../hooks/useReading";
import { HAZARD_LABEL, STAGE_CONTENT } from "../data/stageContent";
import type { Reading } from "../lib/reading";
import { STAGE_RANK, type HazardKind, type StageLevel } from "../lib/stages";

interface Props {
  hourly: HourlyReading[];
  reading: Reading | null;
  loading: boolean;
  hazardOverride?: HazardKind | null;
}

const STAGE_VAR: Record<StageLevel, string> = {
  normal: "var(--stage-normal)",
  interest: "var(--stage-interest)",
  warning: "var(--stage-warning)",
  danger: "var(--stage-danger)",
};

const W = 40;

function valueOf(h: HourlyReading, hazard: HazardKind) {
  if (hazard === "heat") return h.heatFeelsLikeC;
  if (hazard === "cold") return h.coldFeelsLikeC;
  return h.rn1mm;
}

function levelOf(h: HourlyReading, hazard: HazardKind): StageLevel {
  if (hazard === "heat") return h.heatLevel;
  if (hazard === "cold") return h.coldLevel;
  if (hazard === "snow") return h.snowLevel;
  return h.rainLevel;
}

function renderBars(hourly: HourlyReading[], hazard: HazardKind) {
  const values = hourly.map((h) => valueOf(h, hazard));
  const isCold = hazard === "cold";
  const isPrecip = hazard === "rain" || hazard === "snow";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(isPrecip ? 1 : 6, max - min);
  const H = 150;
  const padTop = 26;
  const barW = 22;
  const extreme = isCold ? min : max;

  return hourly.map((h, i) => {
    const value = valueOf(h, hazard);
    const level = levelOf(h, hazard);
    const ratio = isPrecip ? value / Math.max(hazard === "snow" ? 3 : 10, max) : (value - min) / span;
    const barH = (isPrecip ? 6 : padTop) + ratio * H;
    const x = i * W + (W - barW) / 2;
    const y = 190 - barH;
    const dry = isPrecip && value < 0.1;
    const isExtreme = value === extreme;
    const label = isPrecip ? (dry ? "0" : value < 10 ? value.toFixed(1) : Math.round(value)) : `${Math.round(value)}°`;
    return (
      <g key={i}>
        <rect
          x={x}
          y={y}
          width={barW}
          height={barH}
          rx="6"
          fill={dry ? "var(--line-strong)" : STAGE_VAR[level]}
          opacity={dry ? 0.55 : 1}
        />
        <text x={i * W + W / 2} y={y - 6} className={`forecast__val ${isExtreme ? "is-extreme" : ""}`}>
          {label}
        </text>
        <text x={i * W + W / 2} y={214} className="forecast__hr">
          {h.time.getHours()}시
        </text>
      </g>
    );
  });
}

function maxStage(items: HourlyReading[], hazard: HazardKind): StageLevel {
  return items.reduce<StageLevel>((max, h) => (STAGE_RANK[levelOf(h, hazard)] > STAGE_RANK[max] ? levelOf(h, hazard) : max), "normal");
}

function summary(hourly: HourlyReading[], hazard: HazardKind) {
  const isCold = hazard === "cold";
  const target = hourly.reduce((pick, item) => {
    if (!pick) return item;
    return isCold ? (valueOf(item, hazard) < valueOf(pick, hazard) ? item : pick) : valueOf(item, hazard) > valueOf(pick, hazard) ? item : pick;
  }, null as HourlyReading | null);
  const value = target ? valueOf(target, hazard) : 0;
  const level = target ? levelOf(target, hazard) : "normal";
  const hour = target ? `${target.time.getHours()}시` : "-";
  const label =
    hazard === "heat"
      ? `최고 체감온도 ${value.toFixed(1)}°C`
      : hazard === "cold"
        ? `최저 체감온도 ${value.toFixed(1)}°C`
        : hazard === "snow"
          ? `최고 적설량 ${value < 10 ? value.toFixed(1) : Math.round(value)}cm`
          : `최고 강수량 ${value < 10 ? value.toFixed(1) : Math.round(value)}mm`;
  return { label, hour, level };
}

function levelLabel(level: StageLevel) {
  return level === "normal" ? "안전" : level === "interest" ? "관심" : level === "warning" ? "주의보" : "경보";
}

export function HourlyForecast({ hourly, reading, loading, hazardOverride }: Props) {
  const hazard = hazardOverride ?? reading?.primaryHazard ?? "heat";
  const isSnow = hazard === "snow";
  const isRain = hazard === "rain";
  const isCold = hazard === "cold";

  if (loading && hourly.length === 0) return <section className="card pad">예보를 불러오는 중…</section>;
  if (hourly.length === 0) {
    return (
      <section className="card pad empty">
        <p>시간대별 예보 데이터가 없습니다.</p>
        <p className="muted">현황 탭에서 위치를 먼저 조회해주세요.</p>
      </section>
    );
  }

  const title = isSnow
    ? "적설량 예보 · 작업 권고"
    : isRain
      ? "강수량 예보 · 작업 권고"
      : isCold
        ? "한파 체감온도 예보 · 작업 권고"
        : "폭염 체감온도 예보 · 작업 권고";
  const unit = isSnow ? "cm" : isRain ? "mm" : "°C";
  const top = summary(hourly, hazard);
  const stage = maxStage(hourly, hazard);
  const stageMeta = STAGE_CONTENT[hazard][stage];

  return (
    <section className="forecast">
      <div className="section-title">
        <b>{HAZARD_LABEL[hazard]}</b> {title}
      </div>

      <div className="forecast-peak card" style={{ "--stage": STAGE_VAR[top.level] } as CSSProperties}>
        <span className="forecast-peak__kicker">하루 중 가장 높은 위험값</span>
        <strong>{top.label}</strong>
        <span>{top.hour} · {levelLabel(top.level)}</span>
      </div>

      <div className="forecast__chartwrap">
        <div className="forecast__unit">{unit}</div>
        <svg className="forecast__chart" viewBox={`0 0 ${hourly.length * W} 224`} preserveAspectRatio="none" role="img" aria-label={`시간대별 ${title}`}>
          {renderBars(hourly, hazard)}
        </svg>
      </div>

      <div className="forecast__advice card">
        <div className="forecast-actions" style={{ "--stage": stageMeta.color } as CSSProperties}>
          <h3>{HAZARD_LABEL[hazard]} {stageMeta.label} 단계 조치사항</h3>
          <ul className="acts">
            {stageMeta.actions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
