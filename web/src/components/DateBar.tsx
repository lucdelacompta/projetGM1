import { useMemo } from 'react';
import { formatDay, shiftDay, todayIso } from '../lib/format';

interface Props {
  value: string;
  onChange: (date: string) => void;
  counts?: Record<string, { total: number; live: number }>;
}

/** Barre de dates glissante, comme le bandeau des jours de Flashscore. */
export default function DateBar({ value, onChange, counts = {} }: Props) {
  const days = useMemo(
    () => Array.from({ length: 9 }, (_, index) => shiftDay(value, index - 4)),
    [value],
  );
  const today = todayIso();

  return (
    <div className="datebar">
      <button className="datebar__nav" onClick={() => onChange(shiftDay(value, -1))} aria-label="Jour precedent">
        ‹
      </button>
      <div className="datebar__scroll">
        {days.map((day) => {
          const info = counts[day];
          return (
            <button
              key={day}
              className={`datebar__day${day === value ? ' is-active' : ''}`}
              onClick={() => onChange(day)}
            >
              {day === today ? "Aujourd'hui" : formatDay(day)}
              <span className="datebar__count">
                {info ? `${info.total} match${info.total > 1 ? 's' : ''}` : '—'}
                {info?.live ? ' • live' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <button className="datebar__nav" onClick={() => onChange(shiftDay(value, 1))} aria-label="Jour suivant">
        ›
      </button>
      <button className="datebar__nav" onClick={() => onChange(today)} title="Revenir a aujourd'hui">
        ⌂
      </button>
    </div>
  );
}
