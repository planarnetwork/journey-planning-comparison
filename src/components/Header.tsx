import type { FeedSession } from '../feed/feed';
import { fromDateNumber } from '../journey/time';
import type { MapSize, Theme } from '../types';
import styles from './Header.module.css';

interface HeaderProps {
  feed: FeedSession;
  status: string;
  mapSize: MapSize;
  theme: Theme;
  onCycleMap: () => void;
  onToggleTheme: () => void;
}

export function Header({ feed, status, mapSize, theme, onCycleMap, onToggleTheme }: HeaderProps) {
  const { index, loaded } = feed;
  const { startDate, endDate, version } = index.feedInfo;

  const summary = `GB rail · ${index.codes.length} stn · ${loaded.trips.toLocaleString()} trips`;
  const detail = [
    `dtd2mysql GTFS${version ? ` ${version}` : ''}`,
    `${index.codes.length} stations, ${loaded.trips.toLocaleString()} trips, ${Object.keys(index.operators).length} operators`,
    startDate && endDate
      ? `covers ${fromDateNumber(startDate)} to ${fromDateNumber(endDate)}`
      : 'no published date range',
  ].join(' — ');

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        RAILPLAN<span>·</span>LAB
      </div>
      <div className={styles.chip} title={detail}>
        {summary}
      </div>
      <div className={styles.spacer} />
      <div className={styles.chip}>{status}</div>
      <button type="button" className={styles.button} onClick={onCycleMap}>
        map: {mapSize}
      </button>
      <button type="button" className={styles.button} onClick={onToggleTheme}>
        {theme === 'dark' ? 'light' : 'dark'}
      </button>
    </header>
  );
}
