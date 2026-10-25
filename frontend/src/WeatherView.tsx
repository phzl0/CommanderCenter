import {
  Cloud,
  CloudRain,
  Sun,
  CloudLightning,
  Snowflake,
  Wind,
  Droplets,
} from "lucide-react";
import type { ChartData } from "./intelligenceTypes";
function WeatherIcon({
  code,
  size = 24,
}: {
  code: number | null;
  size?: number;
}) {
  const Icon =
    code === 0
      ? Sun
      : code !== null && code >= 95
        ? CloudLightning
        : code !== null && [71, 73, 75, 77, 85, 86].includes(code)
          ? Snowflake
          : code !== null && code >= 51
            ? CloudRain
            : Cloud;
  return <Icon size={size} />;
}
export default function WeatherView({
  weather,
  city,
  detailed = false,
}: {
  weather: NonNullable<ChartData["weather"]>;
  city?: string;
  detailed?: boolean;
}) {
  return (
    <div className="weather-view">
      <div className="weather-current">
        <span className="weather-big-icon">
          <WeatherIcon code={weather.code} size={48} />
        </span>
        <div>
          <span>{city}</span>
          <strong>
            {weather.temperature === null
              ? "—"
              : Math.round(weather.temperature)}
            °<small>C</small>
          </strong>
          <p>{weather.condition}</p>
        </div>
      </div>
      <div className="weather-facts">
        <span>Sensação {weather.feels_like ?? "—"}°C</span>
        <span>
          <Wind size={14} />
          {weather.wind ?? "—"} km/h
        </span>
      </div>
      <div className="weather-facts">
        <span>Umidade {weather.humidity ?? "—"}%</span>
        <span>Chuva {weather.precipitation ?? "—"} mm</span>
        <span>
          Máx. {weather.days[0]?.max ?? "—"}° · Mín.{" "}
          {weather.days[0]?.min ?? "—"}°
        </span>
      </div>
      {!!weather.hours?.length && (
        <div className="weather-hours" aria-label="Previsão por hora">
          {weather.hours.slice(0, detailed ? 24 : 12).map((h) => (
            <div key={h.time}>
              <time>{h.time.split("T")[1]?.slice(0, 5)}</time>
              <WeatherIcon code={h.code} size={18} />
              <strong>
                {h.temperature == null ? "—" : Math.round(h.temperature)}°
              </strong>
              <small>{h.rain ?? "—"}%</small>
            </div>
          ))}
        </div>
      )}
      <div className="weather-days">
        {weather.days.slice(0, detailed ? 7 : 4).map((day) => (
          <div key={day.date}>
            <span>
              {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "short",
              })}
            </span>
            <WeatherIcon code={day.code} />
            <strong>
              {Math.round(day.max)}° <small>{Math.round(day.min)}°</small>
            </strong>
            <span>
              <Droplets size={10} />
              {day.rain ?? "—"}%
            </span>
            {detailed && <p>{day.condition}</p>}
          </div>
        ))}
      </div>
      <small className="weather-timestamp">
        Horário da localidade: {weather.time?.replace("T", " ")} ·{" "}
        {weather.timezone}
      </small>
    </div>
  );
}
