import type { FeedSession } from '../feed/feed';
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
  const { index, groups, trips } = feed;

  const summary = `GB rail · ${index.codes.length} stn · ${trips.toLocaleString()} trips`;
  const detail = [
    'gb-transit GTFS',
    `${index.codes.length} stations, ${trips.toLocaleString()} trips`,
    `${Object.keys(index.routes).length} routes, ${Object.keys(index.operators).length} operators`,
    `${Object.keys(groups).length} station groups`,
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
