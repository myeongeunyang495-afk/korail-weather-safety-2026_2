const NCST = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
const FCST = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
};

export async function handler(event) {
  const key = process.env.KMA_SERVICE_KEY;
  const lat = Number(event.queryStringParameters?.lat);
  const lon = Number(event.queryStringParameters?.lon);
  const mode = event.queryStringParameters?.mode;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return resp(400, { error: "lat/lon required" });
  }
  if (!key) {
    return resp(503, { error: "KMA_SERVICE_KEY not configured" });
  }

  const grid = latLonToGrid(lat, lon);

  try {
    if (mode === "hourly") {
      const hourly = await fetchHourly(key, grid);
      return resp(200, { hourly, grid });
    }
    const now = await fetchNow(key, grid);
    return resp(200, { ...now, grid });
  } catch (err) {
    return resp(502, { error: String(err && err.message ? err.message : err) });
  }
}

async function fetchNow(key, grid) {
  const candidates = baseCandidates(new Date(), 6, "ncst");
  let lastErr;
  for (const base of candidates) {
    try {
      const items = await callKma(NCST, key, grid, base, 60);
      let temp = null;
      let humidity = null;
      let wind = null;
      let rn1 = 0;
      let pty = 0;
      for (const it of items) {
        const v = Number(it.obsrValue);
        if (it.category === "T1H") temp = v;
        else if (it.category === "REH") humidity = v;
        else if (it.category === "WSD") wind = v;
        else if (it.category === "RN1") rn1 = Number.isFinite(v) ? v : 0;
        else if (it.category === "PTY") pty = Number.isFinite(v) ? v : 0;
      }
      if (Number.isFinite(temp) && Number.isFinite(humidity)) {
        return { temp, humidity, wind: wind ?? 0, rn1, pty, base };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("KMA current observation data not found");
}

async function fetchHourly(key, grid) {
  const candidates = baseCandidates(new Date(), 6, "fcst");
  let lastErr;
  for (const base of candidates) {
    try {
      const items = await callKma(FCST, key, grid, base, 300);
      const byTime = new Map();
      for (const it of items) {
        const t = `${it.fcstDate}${it.fcstTime}`;
        const cur = byTime.get(t) || {};
        const v = Number(it.fcstValue);
        if (it.category === "T1H") cur.temp = v;
        else if (it.category === "REH") cur.humidity = v;
        else if (it.category === "WSD") cur.wind = v;
        else if (it.category === "PTY") cur.pty = Number.isFinite(v) ? v : 0;
        else if (it.category === "SKY") cur.sky = Number.isFinite(v) ? v : undefined;
        else if (it.category === "RN1") cur.rn1 = parseRn1(it.fcstValue);
        byTime.set(t, cur);
      }
      const hourly = [...byTime.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([t, c]) => ({
          time: isoFromKma(t),
          temp: c.temp,
          humidity: c.humidity,
          wind: c.wind,
          pty: c.pty ?? 0,
          sky: c.sky,
          rn1: c.rn1 ?? 0,
        }))
        .filter((p) => Number.isFinite(p.temp));
      if (hourly.length) return hourly;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("KMA hourly forecast data not found");
}

async function callKma(endpoint, key, grid, base, rows) {
  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(key),
    pageNo: "1",
    numOfRows: String(rows),
    dataType: "JSON",
    base_date: base.date,
    base_time: base.time,
    nx: String(grid.x),
    ny: String(grid.y),
  });
  const res = await fetch(`${endpoint}?${params}`);
  if (!res.ok) throw new Error(`KMA ${res.status}`);
  const data = await res.json();
  const code = data?.response?.header?.resultCode;
  const items = data?.response?.body?.items?.item;
  if (code !== "00" || !Array.isArray(items)) {
    throw new Error(data?.response?.header?.resultMsg || `KMA code ${code}`);
  }
  return items;
}

function resp(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function normalizeServiceKey(key) {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function isoFromKma(t) {
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:00+09:00`;
}

function baseCandidates(now, hoursBack, kind) {
  const p = kstParts(now);
  const minuteCut = kind === "ncst" ? 40 : 45;
  let baseMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, 0, 0, 0);
  if (p.minute < minuteCut) baseMs -= HOUR_MS;
  const mm = kind === "fcst" ? "30" : "00";

  return Array.from({ length: hoursBack + 1 }, (_, i) => {
    const c = new Date(baseMs - i * HOUR_MS);
    return {
      date: `${c.getUTCFullYear()}${p2(c.getUTCMonth() + 1)}${p2(c.getUTCDate())}`,
      time: `${p2(c.getUTCHours())}${mm}`,
    };
  });
}

function kstParts(date) {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

function p2(n) {
  return String(n).padStart(2, "0");
}

function parseRn1(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s || s === "-" || s.includes("강수없음") || s.toLowerCase() === "no precipitation") return 0;
  if (s.includes("1mm 미만") || s.includes("1.0mm 미만")) return 0.5;
  const nums = [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
  if (!nums.length) return 0;
  return Math.max(...nums);
}

function latLonToGrid(lat, lon) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    x: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    y: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}
