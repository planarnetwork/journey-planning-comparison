import { useEffect, useId, useState } from 'react';
import { formatTime, parseTime } from '../journey/time';
import styles from './Sidebar.module.css';

interface TimeInputProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

/**
 * A departure time on a 24-hour clock.
 *
 * Not `<input type="time">`: that draws itself on whichever clock the browser's locale asks for,
 * which is a 12-hour one under a US locale, and no attribute reliably says otherwise across
 * browsers. So this is a plain text field that takes `HH:MM`, or the same without the colon.
 *
 * What is being typed is held here and only a time that reads as one is handed on, because the
 * workbench re-runs the comparison whenever the query's time changes and a half-typed one is not
 * worth a planning run. Anything still unreadable when the field is left goes back to the last
 * time that was.
 */
export function TimeInput({ title, value, onChange, onSubmit }: TimeInputProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);

  // The query is the truth whenever it changes from anywhere other than this field.
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const minutes = parseTime(draft);
    const time = minutes === null ? value : formatTime(minutes);
    setDraft(time);
    onChange(time);
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{title}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        placeholder="HH:MM"
        value={draft}
        // Left as typed rather than tidied on the way through, so that the cursor is not moved out
        // from under whoever is typing. Tidying is what leaving the field is for.
        onChange={(e) => {
          setDraft(e.target.value);
          if (parseTime(e.target.value) !== null) onChange(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          commit();
          onSubmit();
        }}
      />
    </div>
  );
}
