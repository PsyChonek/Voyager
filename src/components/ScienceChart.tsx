import { useEffect, useRef, useState } from 'react';
import uPlot, { type AlignedData, type Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { EVENTS, loadScience, type Science } from '~/lib/science';
import { reportError } from '~/lib/errors';

export type ChartKind = 'heliopauseV1' | 'heliopauseV2' | 'distance' | 'field' | 'wind';

type Labels = {
  low: string;
  gcr: string;
  r: string;
  b: string;
  v: string;
  v1: string;
  v2: string;
  ts: string;
  hp: string;
  loading: string;
  error: string;
};

const C = {
  v1: '#ffb547',
  v2: '#5ec8ff',
  low: '#ffb547',
  gcr: '#ff7aa8',
  grid: '#1f2a44',
  text: '#a3aec2',
};

type Marker = { t: number; label: string; color: string };

function markersPlugin(markers: Marker[]): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const { ctx } = u;
        const { top, height } = u.bbox;
        ctx.save();
        ctx.font = `${12 * devicePixelRatio}px system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        markers.forEach((m, i) => {
          const x = Math.round(u.valToPos(m.t, 'x', true));
          if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) return;
          ctx.strokeStyle = m.color;
          ctx.setLineDash([4 * devicePixelRatio, 4 * devicePixelRatio]);
          ctx.lineWidth = devicePixelRatio;
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + height);
          ctx.stroke();
          ctx.fillStyle = m.color;
          const w = ctx.measureText(m.label).width;
          const right = x + 6 * devicePixelRatio + w < u.bbox.left + u.bbox.width;
          ctx.fillText(
            m.label,
            right ? x + 6 * devicePixelRatio : x - 6 * devicePixelRatio - w,
            top + (6 + i * 16) * devicePixelRatio,
          );
        });
        ctx.restore();
      },
    },
  };
}

let tickFmt = new Intl.NumberFormat('en', { maximumSignificantDigits: 2 });
const ticks = (_: uPlot, splits: number[]) =>
  splits.map((v) => (v == null ? '' : tickFmt.format(v)));

function axis(label: string, side: 1 | 3 = 3, scale = 'y'): uPlot.Axis {
  return {
    scale,
    side,
    label,
    stroke: C.text,
    grid: { stroke: C.grid, width: 1 },
    ticks: { stroke: C.grid },
    values: ticks,
    size: 64,
    labelSize: 22,
  };
}

function build(
  kind: ChartKind,
  sci: Science,
  L: Labels,
  locale: string,
): { data: AlignedData; opts: Omit<Options, 'width' | 'height'> } {
  tickFmt = new Intl.NumberFormat(locale, { maximumSignificantDigits: 2 });
  const xAxis: uPlot.Axis = {
    stroke: C.text,
    grid: { stroke: C.grid, width: 1 },
    ticks: { stroke: C.grid },
  };
  const nf = new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 });
  const val = (_: uPlot, v: number | null) => (v === null ? '-' : nf.format(v));
  const base = { legend: { live: true }, cursor: { drag: { x: true, y: false } } };

  if (kind === 'heliopauseV1' || kind === 'heliopauseV2') {
    const craft = kind === 'heliopauseV1' ? 'v1' : 'v2';
    const h = sci.craft[craft].heliopause;
    return {
      data: [h.t, h.low, h.gcr] as AlignedData,
      opts: {
        ...base,
        scales: { x: { time: true }, y: { distr: 3 }, y2: { distr: 3 } },
        axes: [xAxis, axis(L.low), axis(L.gcr, 1, 'y2')],
        series: [
          {},
          { label: L.low, stroke: C.low, width: 1.5, scale: 'y', value: val },
          { label: L.gcr, stroke: C.gcr, width: 1.5, scale: 'y2', value: val },
        ],
        plugins: [markersPlugin([{ t: EVENTS[craft].hp.t, label: L.hp, color: '#e9edf5' }])],
      },
    };
  }

  if (kind === 'wind') {
    const m = sci.craft.v2.mission;
    return {
      data: [m.t, m.v] as AlignedData,
      opts: {
        ...base,
        scales: { x: { time: true }, y: { range: [0, 700] } },
        axes: [xAxis, axis(L.v)],
        series: [{}, { label: L.v2, stroke: C.v2, width: 1.5, value: val }],
        plugins: [
          markersPlugin([
            { t: EVENTS.v2.ts.t, label: L.ts, color: '#ff9d5c' },
            { t: EVENTS.v2.hp.t, label: L.hp, color: '#e9edf5' },
          ]),
        ],
      },
    };
  }

  const key = kind === 'distance' ? 'r' : 'b';
  const a = sci.craft.v1.mission;
  const b = sci.craft.v2.mission;
  const joined = uPlot.join([[a.t, a[key]] as AlignedData, [b.t, b[key]] as AlignedData]);
  return {
    data: joined,
    opts: {
      ...base,
      scales: { x: { time: true }, y: kind === 'field' ? { distr: 3 } : {} },
      axes: [xAxis, axis(kind === 'distance' ? L.r : L.b)],
      series: [
        {},
        { label: L.v1, stroke: C.v1, width: 1.5, spanGaps: kind === 'distance', value: val },
        { label: L.v2, stroke: C.v2, width: 1.5, spanGaps: kind === 'distance', value: val },
      ],
      plugins: [
        markersPlugin([
          { t: EVENTS.v1.hp.t, label: `${L.hp} V1`, color: C.v1 },
          { t: EVENTS.v2.hp.t, label: `${L.hp} V2`, color: C.v2 },
        ]),
      ],
    },
  };
}

export default function ScienceChart({
  kind,
  labels,
  locale,
  height = 340,
}: {
  kind: ChartKind;
  labels: Labels;
  locale: string;
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let plot: uPlot | null = null;
    let ro: ResizeObserver | null = null;
    let alive = true;
    loadScience()
      .then((sci) => {
        if (!alive || !host.current) return;
        const { data, opts } = build(kind, sci, labels, locale);
        const width = host.current.clientWidth;
        plot = new uPlot(
          { ...opts, width, height: width < 500 ? 260 : height },
          data,
          host.current,
        );
        ro = new ResizeObserver(() => {
          if (plot && host.current)
            plot.setSize({
              width: host.current.clientWidth,
              height: host.current.clientWidth < 500 ? 260 : height,
            });
        });
        ro.observe(host.current);
        setStatus('ready');
      })
      .catch((e) => {
        reportError(e, { component: 'ScienceChart', kind });
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
      ro?.disconnect();
      plot?.destroy();
    };
  }, [kind, labels, locale, height]);

  return (
    <div className="chart" aria-hidden={status === 'ready' ? 'true' : undefined}>
      {status !== 'ready' && (
        <p className="chart-status muted" role="status">
          {status === 'loading' ? labels.loading : labels.error}
        </p>
      )}
      <div ref={host} />
    </div>
  );
}
