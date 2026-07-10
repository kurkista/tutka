// panels/status.ts — left panel: band chip, Nordic tension gauge + component
// breakdown. Ship/flight/news summary numbers live in panels/layers.ts (the
// "Live layers" card). No transit sparkline/ticker — gate-crossing detection
// has no equivalent in the open Baltic (see server/vessels.js's GATE.enabled).
import type * as echarts from 'echarts/core';
import type { AppState, IndexSnapshot } from '../types';
import { t, fmtNum } from '../i18n';
import { makeGauge, setGauge, bindResize } from '../charts';

const COMPONENT_KEYS = ['V', 'T'] as const;

let gauge: echarts.ECharts;

export async function init(s: AppState): Promise<void> {
  gauge = makeGauge(document.getElementById('hpi-gauge')!);
  renderIndex(s.modules.nordic.index);
  bindResize(gauge);
}

export function onNordicIndex(snapshot: IndexSnapshot): void {
  renderIndex(snapshot);
}

function renderIndex(snapshot: IndexSnapshot | null): void {
  const chip = document.getElementById('band-chip')!;
  const label = document.getElementById('band-label')!;
  chip.className = 'band-chip ' + (snapshot ? `band-${snapshot.band}` : 'band-none');
  label.textContent = snapshot
    ? `${t('band.' + snapshot.band)} · ${Math.round(snapshot.value)}`
    : t('status.warming');

  if (snapshot) setGauge(gauge, snapshot.value);

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
