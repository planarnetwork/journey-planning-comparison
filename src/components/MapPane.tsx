import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type Stations, useStations } from '../feed/stations';
import type { TransferMode } from '../feed/types';
import { formatTime } from '../journey/time';
import { isTrainLeg, type Journey } from '../journey/types';
import { MAP_COLORS, operatorColor } from '../theme/colors';
import type { Theme } from '../types';
import styles from './MapPane.module.css';

const MODE_LABEL: Record<TransferMode, string> = {
  foot: 'on foot',
  tube: 'by Tube',
  bus: 'by bus',
  ferry: 'by ferry',
};

type Point = [number, number];

interface MapPaneProps {
  journey: Journey | null;
  /** Shown in the legend above the operator key. */
  caption: string | null;
  theme: Theme;
}

export function MapPane({ journey, caption, theme }: MapPaneProps) {
  const stations = useStations();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const networkLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);

  const points = useMemo(() => coordinates(stations), [stations]);
  const bounds = useMemo(() => L.latLngBounds([...points.values()]).pad(0.02), [points]);

  const latLng = useCallback((code: string): Point | null => points.get(code) ?? null, [points]);

  // Create the map once. Leaflet owns its DOM from here on.
  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      // A few thousand station dots as SVG elements would be a few thousand DOM nodes.
      preferCanvas: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 17,
    }).addTo(instance);

    networkLayer.current = L.layerGroup().addTo(instance);
    routeLayer.current = L.layerGroup().addTo(instance);
    instance.fitBounds(bounds, { animate: false });
    map.current = instance;

    // Also covers the map-size control: changing --maph resizes this element.
    const observer = new ResizeObserver(() =>
      instance.invalidateSize({ animate: false, pan: false }),
    );
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [bounds]);

  // Every station the feed plans between, as an underlay. It is theme-coloured, so it redraws when
  // the theme flips.
  useEffect(() => {
    const layer = networkLayer.current;
    if (!layer) return;
    layer.clearLayers();
    const color = MAP_COLORS[theme].dim;
    for (const point of points.values()) {
      L.circleMarker(point, {
        radius: 1.3,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.42,
        interactive: false,
      }).addTo(layer);
    }
  }, [theme, points]);

  const fitJourney = useCallback(
    (target: Journey) => {
      const track = target.legs
        .flatMap((leg) => (isTrainLeg(leg) ? leg.stops : [leg.from, leg.to]))
        .map(latLng)
        .filter((point): point is Point => point !== null);
      if (track.length) {
        map.current?.fitBounds(L.latLngBounds(track).pad(0.28), { animate: false });
      }
    },
    [latLng],
  );

  // Redraw the selected journey, and frame it.
  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!journey) return;

    const { dim, panel } = MAP_COLORS[theme];
    for (const leg of journey.legs) {
      const stops = (isTrainLeg(leg) ? leg.stops : [leg.from, leg.to]).filter((code) =>
        points.has(code),
      );
      const track = stops.map((code) => points.get(code)!);
      if (track.length < 2) continue;
      const color = isTrainLeg(leg) ? operatorColor(leg.toc) : dim;

      if (isTrainLeg(leg)) {
        L.polyline(track, { color: '#000', weight: 8, opacity: 0.16, interactive: false }).addTo(
          layer,
        );
        L.polyline(track, { color, weight: 3.6, opacity: 0.97, interactive: false }).addTo(layer);
      } else {
        L.polyline(track, {
          color,
          weight: 2.4,
          opacity: 0.9,
          dashArray: '3 5',
          interactive: false,
        }).addTo(layer);
      }

      // Only the calls a passenger can use get a marker; the rest of the track is the line the
      // train takes between them.
      const marked = isTrainLeg(leg)
        ? new Set(leg.points.map((point) => point.stop))
        : new Set(stops);

      stops.forEach((code, i) => {
        const end = i === 0 || i === stops.length - 1;
        if (!end && !marked.has(code)) return;
        L.circleMarker(points.get(code)!, {
          radius: end ? 4.4 : 2.4,
          color,
          weight: end ? 2.2 : 0,
          fillColor: end ? panel : color,
          fillOpacity: 1,
        })
          .bindTooltip(`${stations.name(code)}${isTrainLeg(leg) ? ` · ${leg.operator}` : ''}`, {
            direction: 'top',
          })
          .addTo(layer);
      });
    }
    fitJourney(journey);
  }, [journey, theme, fitJourney, points, stations]);

  const operators = journey
    ? [...new Map(journey.legs.filter(isTrainLeg).map((l) => [l.toc, l.operator]))]
    : [];
  const modes = journey
    ? [...new Set(journey.legs.filter((l) => !isTrainLeg(l)).map((l) => l.mode))]
    : [];

  return (
    <div className={styles.wrap}>
      <div ref={container} className={styles.map} />

      <div className={`${styles.overlay} ${styles.legend}`}>
        {caption && <div className={`${styles.legendRow} ${styles.legendHead}`}>{caption}</div>}
        {operators.map(([toc, name]) => (
          <div key={toc} className={styles.legendRow}>
            <s style={{ borderColor: operatorColor(toc) }} />
            {name}
          </div>
        ))}
        {modes.map((mode) => (
          <div key={mode} className={styles.legendRow}>
            <s style={{ borderColor: MAP_COLORS[theme].dim, borderTopStyle: 'dashed' }} />
            change {MODE_LABEL[mode]}
          </div>
        ))}
      </div>

      <div className={`${styles.overlay} ${styles.controls}`}>
        <button type="button" title="zoom out" onClick={() => map.current?.zoomOut()}>
          −
        </button>
        <button type="button" title="zoom in" onClick={() => map.current?.zoomIn()}>
          +
        </button>
        <button
          type="button"
          title="fit selected journey"
          onClick={() => journey && fitJourney(journey)}
        >
          fit
        </button>
        <button
          type="button"
          title="fit the whole network"
          onClick={() => map.current?.fitBounds(bounds, { animate: false })}
        >
          GB
        </button>
      </div>
    </div>
  );
}

/** Station coordinates, skipping the ones a feed leaves at nowhere. */
function coordinates(stations: Stations): Map<string, Point> {
  const points = new Map<string, Point>();
  for (const code of stations.codes) {
    const station = stations.at(code);
    if (!station) continue;
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)) continue;
    if (station.lat === 0 && station.lon === 0) continue;
    points.set(code, [station.lat, station.lon]);
  }
  return points;
}

/** Legend caption for a selected journey, e.g. `RAPTOR · 08:00→12:26`. */
export const mapCaption = (planner: string, journey: Journey): string =>
  `${planner} · ${formatTime(journey.dep)}→${formatTime(journey.arr)}`;
