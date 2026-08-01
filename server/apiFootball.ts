/**
 * API-Football integration (https://www.api-football.com)
 * Docs: https://www.api-football.com/documentation-v3
 */

const BASE_URL = "https://v3.football.api-sports.io";

function getKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY n'est pas défini");
  return key;
}

async function apiFetch(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "x-apisports-key": getKey(),
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    const msg = JSON.stringify(json.errors);
    throw new Error(`API-Football erreur: ${msg}`);
  }
  return json;
}

/** Format a Date as YYYY-MM-DD */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ApiFixture {
  externalId: string;     // fixture.id
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;       // country flag emoji or empty
  awayFlag: string;
  league: string;
  matchDate: Date;
  /** Short status code: NS, 1H, HT, 2H, ET, PEN, FT, AET, etc. */
  statusShort: string;
  /** Goals home (null if not started) */
  goalsHome: number | null;
  /** Goals away (null if not started) */
  goalsAway: number | null;
  /** Current elapsed minute */
  elapsed: number | null;
}

/** Fetch upcoming fixtures for the next N days */
export async function fetchUpcomingFixtures(days = 7): Promise<ApiFixture[]> {
  const results: ApiFixture[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = fmtDate(d);
    try {
      const json = await apiFetch(`/fixtures?date=${dateStr}&timezone=Africa%2FAbidjan`);
      for (const f of json.response ?? []) {
        results.push(mapFixture(f));
      }
    } catch (e) {
      console.error(`[apiFootball] Erreur pour ${dateStr}:`, e);
    }
  }
  return results;
}

/** Fetch currently live fixtures */
export async function fetchLiveFixtures(): Promise<ApiFixture[]> {
  try {
    const json = await apiFetch("/fixtures?live=all");
    return (json.response ?? []).map(mapFixture);
  } catch (e) {
    console.error("[apiFootball] Erreur live:", e);
    return [];
  }
}

/** Fetch a single fixture by its external ID */
export async function fetchFixtureById(externalId: string): Promise<ApiFixture | null> {
  try {
    const json = await apiFetch(`/fixtures?id=${externalId}`);
    const list = json.response ?? [];
    if (list.length === 0) return null;
    return mapFixture(list[0]);
  } catch (e) {
    console.error(`[apiFootball] Erreur fixture ${externalId}:`, e);
    return null;
  }
}

function mapFixture(f: any): ApiFixture {
  const g = f.goals ?? {};
  return {
    externalId:  String(f.fixture?.id ?? ""),
    homeTeam:    f.teams?.home?.name ?? "Équipe A",
    awayTeam:    f.teams?.away?.name ?? "Équipe B",
    homeFlag:    countryToEmoji(f.teams?.home?.country ?? ""),
    awayFlag:    countryToEmoji(f.teams?.away?.country ?? ""),
    league:      [f.league?.country, f.league?.name].filter(Boolean).join(": "),
    matchDate:   new Date(f.fixture?.date ?? Date.now()),
    statusShort: f.fixture?.status?.short ?? "NS",
    goalsHome:   g.home ?? null,
    goalsAway:   g.away ?? null,
    elapsed:     f.fixture?.status?.elapsed ?? null,
  };
}

/** Live score string, e.g. "1-0 45'" */
export function liveScoreStr(f: ApiFixture): string {
  if (f.goalsHome === null || f.goalsAway === null) return "";
  const score = `${f.goalsHome}-${f.goalsAway}`;
  return f.elapsed ? `${score} ${f.elapsed}'` : score;
}

/** True when the match is fully finished on the API side */
export function isFinished(statusShort: string): boolean {
  return ["FT", "AET", "PEN"].includes(statusShort);
}

/** True when the match is currently in play */
export function isInPlay(statusShort: string): boolean {
  return ["1H", "HT", "2H", "ET", "BT", "P"].includes(statusShort);
}

// ── Country → flag emoji ──────────────────────────────────────────────────────
const COUNTRY_EMOJI: Record<string, string> = {
  France: "🇫🇷", Spain: "🇪🇸", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Germany: "🇩🇪", Italy: "🇮🇹",
  Portugal: "🇵🇹", Brazil: "🇧🇷", Argentina: "🇦🇷", Netherlands: "🇳🇱", Belgium: "🇧🇪",
  "Ivory Coast": "🇨🇮", Senegal: "🇸🇳", Morocco: "🇲🇦", Nigeria: "🇳🇬",
  Cameroon: "🇨🇲", Ghana: "🇬🇭", Egypt: "🇪🇬", Tunisia: "🇹🇳", Algeria: "🇩🇿",
  USA: "🇺🇸", Mexico: "🇲🇽", Colombia: "🇨🇴", Uruguay: "🇺🇾", Chile: "🇨🇱",
  Japan: "🇯🇵", "South Korea": "🇰🇷", Turkey: "🇹🇷", Croatia: "🇭🇷",
  "Saudi Arabia": "🇸🇦", Qatar: "🇶🇦", Greece: "🇬🇷", Switzerland: "🇨🇭",
  Poland: "🇵🇱", Denmark: "🇩🇰", Sweden: "🇸🇪", Norway: "🇳🇴",
  "World": "🌍", Europe: "🌍",
};

function countryToEmoji(country: string): string {
  return COUNTRY_EMOJI[country] ?? "🏴";
}
