import { useEffect, useId, useRef, useState } from 'react';
import { useStations } from '../feed/stations';
import styles from './Sidebar.module.css';

interface StationInputProps {
  title: string;
  value: string;
  placeholder?: string;
  /** Accept a comma-separated list, completing only the last entry. */
  multi?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function StationInput({
  title,
  value,
  placeholder,
  multi = false,
  onChange,
  onSubmit,
}: StationInputProps) {
  const stations = useStations();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const term = multi ? (value.split(',').pop() ?? '').trim() : value.trim();
  const matches = open ? stations.match(term) : [];
  const index = Math.min(active, Math.max(matches.length - 1, 0));

  const pick = (code: string) => {
    if (multi) {
      const parts = value.split(',');
      parts[parts.length - 1] = ` ${stations.label(code)}`;
      onChange(`${parts.join(',').replace(/^\s+/, '')}, `);
    } else {
      onChange(stations.label(code));
    }
    setOpen(false);
    setActive(0);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{title}</label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) return setOpen(true);
            if (!matches.length) return;
            setActive(
              (i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length,
            );
          } else if (e.key === 'Enter') {
            const choice = matches[index];
            if (open && choice) {
              e.preventDefault();
              pick(choice);
            } else {
              onSubmit();
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {matches.length > 0 && (
        <div className={styles.autocomplete}>
          {matches.map((code, i) => (
            <button
              type="button"
              key={code}
              className={i === index ? `${styles.option} ${styles.optionActive}` : styles.option}
              // mousedown fires before blur, so the click is not lost to the timer.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(code);
              }}
            >
              <span>{stations.name(code)}</span>
              <em>{code}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
