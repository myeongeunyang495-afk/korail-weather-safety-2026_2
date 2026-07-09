const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=300",
};

const ENDPOINTS = [
  "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList",
  "https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg",
];

export async function handler() {
  const key = process.env.KMA_WARNING_SERVICE_KEY || process.env.KMA_SERVICE_KEY;
  if (!key) return resp(503, { warnings: [], error: "KMA_SERVICE_KEY not configured" });

  const attempts = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const items = await callKmaWarning(endpoint, key);
      const warnings = normalizeWarnings(items);
      if (warnings.length) return resp(200, { warnings, source: endpoint });
      attempts.push({ endpoint, count: 0 });
    } catch (err) {
      attempts.push({ endpoint, error: String(err && err.message ? err.message : err) });
    }
  }

  return resp(200, { warnings: [], attempts });
}

async function callKmaWarning(endpoint, key) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(key),
    pageNo: "1",
    numOfRows: "300",
    dataType: "JSON",
    stnId: "108",
    fromTmFc: formatKst(from),
    toTmFc: formatKst(to),
  });

  const res = await fetch(`${endpoint}?${params}`);
  if (!res.ok) throw new Error(`KMA warning ${res.status}`);
  const data = await res.json();
  const header = data?.response?.header;
  const code = header?.resultCode;
  const items = data?.response?.body?.items?.item;

  if (code && code !== "00" && code !== "03") {
    throw new Error(header?.resultMsg || `KMA warning code ${code}`);
  }
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function normalizeWarnings(items) {
  const out = [];
  for (const item of items) {
    const text = objectText(item);
    const hazard = hazardFrom(text, item);
    if (!hazard) continue;
    const level = levelFrom(text, item);
    const regions = regionsFrom(text, item);
    out.push({
      id: String(item.tmSeq || item.seq || item.tmef || item.tmFc || `${hazard}-${out.length}`),
      hazard,
      level,
      title: titleFrom(text, item, hazard, level),
      regions,
      issuedAt: item.tmFc || item.announceTime || item.tmIssue || null,
      effectiveAt: item.tmEf || item.effectiveTime || item.tmef || null,
      text,
    });
  }
  return dedupe(out);
}

function hazardFrom(text, item) {
  const warnVar = String(item.warnVar || item.wrnVar || item.var || "");
  if (/폭염|heat/i.test(text) || warnVar === "6" || warnVar === "33") return "heat";
  if (/호우|heavy rain|rainstorm/i.test(text) || warnVar === "3" || warnVar === "12") return "rain";
  if (/대설|폭설|눈|snow/i.test(text) || warnVar === "8" || warnVar === "13") return "snow";
  if (/한파|cold wave/i.test(text) || warnVar === "4" || warnVar === "14") return "cold";
  return null;
}

function levelFrom(text, item) {
  const stress = String(item.warnStress || item.wrnStress || item.stress || "");
  if (/경보|warning/i.test(text) || stress === "1") return "danger";
  return "warning";
}

function regionsFrom(text, item) {
  const direct = item.areaName || item.area || item.region || item.regName || item.zoneName || item.target || item.wrnArea;
  const raw = String(direct || text || "");
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/발효|발표|주의보|경보|폭염|호우|대설|폭설|한파/g, " ")
    .replace(/[.:;|]/g, " ");
  const tokens = cleaned
    .split(/[,，、\n\/]+|\s{2,}/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && x.length <= 30);
  return [...new Set(tokens)].slice(0, 20);
}

function titleFrom(text, item, hazard, level) {
  const title = item.title || item.wrnTitle || item.headline;
  if (title) return String(title);
  const hazardLabel = { heat: "폭염", rain: "호우", snow: "대설", cold: "한파" }[hazard];
  return `${hazardLabel}${level === "danger" ? "경보" : "주의보"}`;
}

function objectText(item) {
  return Object.values(item || {}).map((v) => String(v ?? "")).join(" ");
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.hazard}-${item.level}-${item.title}-${item.regions.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatKst(date) {
  return `${date.getUTCFullYear()}${p2(date.getUTCMonth() + 1)}${p2(date.getUTCDate())}${p2(date.getUTCHours())}${p2(date.getUTCMinutes())}`;
}

function p2(n) {
  return String(n).padStart(2, "0");
}

function normalizeServiceKey(key) {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function resp(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}