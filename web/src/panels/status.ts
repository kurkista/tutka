// panels/status.ts — left panel: band chip, Nordic tension gauge + component
// breakdown. Ship/flight/news summary numbers live in panels/layers.ts (the
// "Live layers" card). No transit sparkline/ticker — gate-crossing detection
// has no equivalent in the open Baltic (see server/vessels.js's GATE.enabled).
import type * as echarts from 'echarts/core';
import type { AppState, IndexSnapshot } from '../types';
import { t, fmtNum } from '../i18n';
import { makeGauge, setGauge } from '../charts';
import { onFirstView, trackChart } from '../lazyView';
import { readingFor } from '../reading';

const COMPONENT_KEYS = ['V', 'T'] as const;

let gauge: echarts.ECharts | null = null;
let latest: IndexSnapshot | null = null;

export async function init(s: AppState): Promise<void> {
  renderIndex(s.modules.nordic.index);
  onFirstView('1', () => {
    gauge = makeGauge(document.getElementById('hpi-gauge')!);
    trackChart('1', gauge);
    setGauge(gauge, latest?.value ?? null);
  });
}

export function onNordicIndex(snapshot: IndexSnapshot): void {
  renderIndex(snapshot);
}

function renderIndex(snapshot: IndexSnapshot | null): void {
  latest = snapshot;
  const chip = document.getElementById('band-chip')!;
  const label = document.getElementById('band-label')!;
  chip.className = 'band-chip ' + (snapshot ? `band-${snapshot.band}` : 'band-none');
  // The chip sits in global chrome on every route but only ever describes
  // domain 1, which nothing on screen used to say.
  chip.title = `${t('domain.1.name')} — ${readingFor(snapshot).detail}`;
  label.textContent = snapshot
    ? `${t('domain.1.short')} ${Math.round(snapshot.value)} · ${t('band.' + snapshot.band)}`
    : t('status.warming');

  if (gauge) setGauge(gauge, snapshot?.value ?? null);

  const list = document.getElementById('hpi-components')!;
  list.innerHTML = '';
  for (const key of COMPONENT_KEYS) {
    const li = document.createElement('li');
    const c = snapshot?.components[key];
    if (c) {
      li.innerHTML = `<span>${t('comp.' + key)}</span><span class="val">${fmtNum(c.score, 0)}</span>`;
      li.title = JSON.stringify(c.raw);
    } else {
      li.innerHTML = `<span>${t('comp.' + key)}</span><span class="stale">${t('comp.stale')}</span>`;
    }
    list.appendChild(li);
  }
}
