/**
 * 기상 데이터 제공자(provider) 인터페이스.
 *
 * 앱은 이 인터페이스에만 의존하고, 실제 구현은 두 가지다:
 *  - kmaProvider: 서버리스 프록시(/api/weather)를 통해 기상청 실데이터를 받는다.
 *  - mockProvider: API 키가 없을 때 계절·시간대를 반영한 합성 데이터를 만든다(데모/오프라인).
 */

/** 현재 실황 */
export interface WeatherNow {
  /** 기온 °C */
  tempC: number;
  /** 상대습도 % */
  humidityPct: number;
  /** 풍속 m/s */
  windMs: number;
  /** 1시간 강수량 mm (기상청 RN1) */
  rn1mm: number;
  /** 강수형태 코드 (기상청 PTY: 0 없음/1 비/2 비눈/3 눈/5 빗방울/6 빗방울눈/7 눈날림) */
  pty: number;
  /** 관측/기준 시각 (표시용 라벨, 로컬) */
  observedAt: Date;
  /** 데이터 출처 */
  source: "kma" | "mock";
  /** 기상청 격자 */
  grid?: { x: number; y: number };
  /** 캐시 지난 값 여부 */
  stale?: boolean;
}

/** 시간대별 예보 한 점 */
export interface HourlyPoint {
  /** 예보 시각 */
  time: Date;
  tempC: number;
  humidityPct: number;
  windMs: number;
  pty: number;
  /** 1시간 예상 강수량 mm */
  rn1mm: number;
}

export interface WeatherProvider {
  /** 현재 실황 */
  getNow(lat: number, lon: number): Promise<WeatherNow>;
  /** 향후 시간대별 예보 (최대 ~12시간) */
  getHourly(lat: number, lon: number): Promise<HourlyPoint[]>;
}
