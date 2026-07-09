import { type CSSProperties } from "react";
import type { HourlyReading, WeatherWarning } from "../hooks/useReading";
import { STAGE_CONTENT } from "../data/stageContent";
import type { Reading } from "../lib/reading";
import { STAGE_RANK, type HazardKind, type StageLevel } from "../lib/stages";

interface Props {
  hourly: HourlyReading[];
  warnings: WeatherWarning[];
  reading: Reading | null;
  loading: boolean;
  hazardOverride?: HazardKind | null;
}

const HAZARD_LABEL: Record<HazardKind, string> = {
  heat: "\uD3ED\uC5FC",
  rain: "\uD638\uC6B0",
  snow: "\uAC15\uC124",
  cold: "\uD55C\uD30C",
};

const STAGE_VAR: Record<StageLevel, string> = {
  normal: "var(--stage-normal)",
  interest: "var(--stage-interest)",
  warning: "var(--stage-warning)",
  danger: "var(--stage-danger)",
};

const W = 64;
const CHART_H = 224;

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
  const barW = 26;
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
    const label = isPrecip ? (dry ? "0" : value < 10 ? value.toFixed(1) : Math.round(value)) : `${Math.round(value)}\u00B0`;
    return (
      <g key={i}>
        <rect x={x} y={y} width={barW} height={barH} rx="6" fill={dry ? "var(--line-strong)" : STAGE_VAR[level]} opacity={dry ? 0.55 : 1} />
        <text x={i * W + W / 2} y={y - 6} className={`forecast__val ${isExtreme ? "is-extreme" : ""}`}>{label}</text>
        <text x={i * W + W / 2} y={214} className="forecast__hr">{h.time.getHours()}\uC2DC</text>
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
  const hour = target ? `${target.time.getHours()}\uC2DC` : "-";
  const label =
    hazard === "heat"
      ? `\uCD5C\uACE0 \uCCB4\uAC10\uC628\uB3C4 ${value.toFixed(1)}\u00B0C`
      : hazard === "cold"
        ? `\uCD5C\uC800 \uCCB4\uAC10\uC628\uB3C4 ${value.toFixed(1)}\u00B0C`
        : hazard === "snow"
          ? `\uCD5C\uACE0 \uC801\uC124\uB7C9 ${value < 10 ? value.toFixed(1) : Math.round(value)}cm`
          : `\uCD5C\uACE0 \uAC15\uC218\uB7C9 ${value < 10 ? value.toFixed(1) : Math.round(value)}mm`;
  return { label, hour, level };
}

function levelLabel(level: StageLevel) {
  return level === "normal" ? "\uC548\uC804" : level === "interest" ? "\uAD00\uC2EC" : level === "warning" ? "\uC8FC\uC758\uBCF4" : "\uACBD\uBCF4";
}

function titleFor(hazard: HazardKind) {
  if (hazard === "snow") return "\uC801\uC124\uB7C9 \uC608\uBCF4 \u00B7 \uC791\uC5C5 \uAD8C\uACE0";
  if (hazard === "rain") return "\uAC15\uC218\uB7C9 \uC608\uBCF4 \u00B7 \uC791\uC5C5 \uAD8C\uACE0";
  if (hazard === "cold") return "\uD55C\uD30C \uCCB4\uAC10\uC628\uB3C4 \uC608\uBCF4 \u00B7 \uC791\uC5C5 \uAD8C\uACE0";
  return "\uD3ED\uC5FC \uCCB4\uAC10\uC628\uB3C4 \uC608\uBCF4 \u00B7 \uC791\uC5C5 \uAD8C\uACE0";
}

function regionsText(regions: string[]) {
  if (!regions.length) return "\uC9C0\uC5ED \uC815\uBCF4 \uD655\uC778 \uD544\uC694";
  return regions.join(", ");
}

function WarningDetail({ warnings, hazard }: { warnings: WeatherWarning[]; hazard: HazardKind }) {
  const items = warnings.filter((w) => w.hazard === hazard);
  return (
    <div className="warning-detail card">
      <div className="warning-detail__head">
        <b>{HAZARD_LABEL[hazard]} \uAE30\uC0C1\uD2B9\uBCF4</b>
        <span>{items.length ? `${items.length}\uAC74 \uD655\uC778` : "\uD2B9\uBCF4 \uC5C6\uC74C"}</span>
      </div>
      {items.length ? (
        <div className="warning-detail__list">
          {items.map((item) => (
            <article key={item.id} className={`warning-detail__item is-${item.level}`}>
              <strong>{item.title}</strong>
              <p>{regionsText(item.regions)}</p>
              {(item.issuedAt || item.effectiveAt) && <small>{item.issuedAt ? `\uBC1C\uD45C ${item.issuedAt}` : ""}{item.effectiveAt ? ` \u00B7 \uBC1C\uD6A8 ${item.effectiveAt}` : ""}</small>}
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">\uD604\uC7AC \uC120\uD0DD\uD55C \uC704\uD5D8\uC758 \uAE30\uC0C1\uD2B9\uBCF4\uAC00 \uD655\uC778\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</p>
      )}
    </div>
  );
}

export function HourlyForecast({ hourly, warnings, reading, loading, hazardOverride }: Props) {
  const hazard = hazardOverride ?? reading?.primaryHazard ?? "heat";
  const isSnow = hazard === "snow";
  const isRain = hazard === "rain";
  const title = titleFor(hazard);

  if (loading && hourly.length === 0) return <section className="card pad">\uC608\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...</section>;
  if (hourly.length === 0) {
    return (
      <section className="card pad empty">
        <p>\uC2DC\uAC04\uB300\uBCC4 \uC608\uBCF4 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
        <p className="muted">\uD604\uD669 \uD0ED\uC5D0\uC11C \uC704\uCE58\uB97C \uBA3C\uC800 \uC870\uD68C\uD574\uC8FC\uC138\uC694.</p>
      </section>
    );
  }

  const unit = isSnow ? "cm" : isRain ? "mm" : "\u00B0C";
  const top = summary(hourly, hazard);
  const stage = maxStage(hourly, hazard);
  const stageMeta = STAGE_CONTENT[hazard][stage];
  const chartWidth = Math.max(hourly.length * W, 760);

  return (
    <section className="forecast">
      <div className="section-title"><b>{HAZARD_LABEL[hazard]}</b> {title}</div>

      <div className="forecast-peak card" style={{ "--stage": STAGE_VAR[top.level] } as CSSProperties}>
        <span className="forecast-peak__kicker">\uD558\uB8E8 \uC911 \uAC00\uC7A5 \uB192\uC740 \uC704\uD5D8\uAC12</span>
        <strong>{top.label}</strong>
        <span>{top.hour} \u00B7 {levelLabel(top.level)}</span>
      </div>

      <WarningDetail warnings={warnings} hazard={hazard} />

      <div className="forecast__chartwrap" aria-label="hourly forecast horizontal scroll area">
        <div className="forecast__unit">{unit}</div>
        <svg className="forecast__chart" width={chartWidth} height={CHART_H} viewBox={`0 0 ${chartWidth} ${CHART_H}`} role="img" aria-label={`\uC2DC\uAC04\uB300\uBCC4 ${title}`}>
          {renderBars(hourly, hazard)}
        </svg>
      </div>

      <div className="forecast__advice card">
        <div className="forecast-actions" style={{ "--stage": stageMeta.color } as CSSProperties}>
          <h3>{HAZARD_LABEL[hazard]} {levelLabel(stage)} \uB2E8\uACC4 \uC870\uCE58\uC0AC\uD56D</h3>
          <ul className="acts">
            {stageMeta.actions.map((action, i) => <li key={i}>{action}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
