import { useEffect, useState } from 'react';
import { FeedLoading } from './components/FeedLoading';
import { Workbench } from './components/Workbench';
import { useFeed } from './feed/useFeed';
import { MAP_SIZES, type MapSize, type Theme } from './types';

export function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mapSize, setMapSize] = useState<MapSize>('md');
  const feed = useFeed();

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.body.dataset.map = mapSize;
  }, [mapSize]);

  if (feed.state !== 'ready') return <FeedLoading status={feed} />;

  return (
    <Workbench
      feed={feed.session}
      theme={theme}
      mapSize={mapSize}
      onCycleMap={() => setMapSize(MAP_SIZES[(MAP_SIZES.indexOf(mapSize) + 1) % MAP_SIZES.length]!)}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    />
  );
}
