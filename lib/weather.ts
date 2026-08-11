import "server-only";
import { getJSON, setJSON } from "./kv";

export interface HourlyForecast {
  time: string; // ISO
  temp: number;
  symbol: string;
}

export interface WeatherData {
  temp: number;
  symbol: string;
  precipitation: number;
  wind: number;
  hourly: HourlyForecast[];
}

const CACHE_KEY = "cache:weather:oslo-sentrum";
const CACHE_TTL_SECONDS = 30 * 60;
// Oslo sentrum — samme koordinater som søsterprosjektet mitt-private sin værboks.
const LAT = 59.9139;
const LON = 10.7522;

interface MetEntry {
  time: string;
  data: {
    instant: { details: { air_temperature: number; wind_speed: number } };
    next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } };
    next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } };
  };
}

export async function getWeather(): Promise<WeatherData> {
  const cached = await getJSON<WeatherData>(CACHE_KEY);
  if (cached) return cached;

  const res = await fetch(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}`,
    { headers: { "User-Agent": "mitt-dashboard/1.0 morten.vadla@mustadeiendom.no" } },
  );
  if (!res.ok) throw new Error(`met.no feil: ${res.status}`);

  const json = await res.json();
  const timeseries: MetEntry[] = json.properties.timeseries;
  const current = timeseries[0];
  const details = current.data.instant.details;
  const next = current.data.next_1_hours ?? current.data.next_6_hours;

  const hourly: HourlyForecast[] = timeseries.slice(0, 12).map((e) => ({
    time: e.time,
    temp: Math.round(e.data.instant.details.air_temperature),
    symbol: (e.data.next_1_hours ?? e.data.next_6_hours)?.summary?.symbol_code ?? "cloudy",
  }));

  const result: WeatherData = {
    temp: Math.round(details.air_temperature),
    symbol: next?.summary?.symbol_code ?? "clearsky_day",
    precipitation: next?.details?.precipitation_amount ?? 0,
    wind: Math.round(details.wind_speed),
    hourly,
  };

  await setJSON(CACHE_KEY, result, CACHE_TTL_SECONDS);
  return result;
}
