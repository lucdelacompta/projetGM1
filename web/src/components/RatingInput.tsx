interface Props {
  value: number | null;
  suggestion?: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

const STEPS = Array.from({ length: 21 }, (_, index) => index * 0.5);

/** Saisie d une note sur 10 par demi-points, avec reprise de la note proposee. */
export default function RatingInput({ value, suggestion, onChange, disabled }: Props) {
  return (
    <div>
      <div className="rating-input">
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            disabled={disabled}
            className={value === step ? 'is-active' : undefined}
            onClick={() => onChange(value === step ? null : step)}
            title={`Note ${step}/10`}
          >
            {step % 1 === 0 ? step : step.toFixed(1)}
          </button>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 6 }}>
        {suggestion != null && (
          <button type="button" className="btn btn--ghost" onClick={() => onChange(suggestion)} disabled={disabled}>
            Reprendre la note proposee ({suggestion})
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => onChange(null)} disabled={disabled}>
          Effacer
        </button>
      </div>
    </div>
  );
}
