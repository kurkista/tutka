// panels/markets.ts — right panel: GDELT news volume meta + headlines feed
// for domain 1 (Nordic). No Brent/Polymarket section — there's no Nordic
// equivalent to Hormuz's oil-market/prediction-market feeds.
import type { AppState, Headline } from '../types';
import { t, fmtNum } from '../i18n';

export async function init(state: AppState): Promise<void> {
  const nordic = state.modules.nordic;
  renderNewsMeta(state.metrics.gdelt_nordic_vol24h?.value ?? null, state.metrics.gdelt_nordic_median30d?.value ?? null);

  const list = document.getElementById('headlines')!;
  list.innerHTML = '';
  if (nordic.headlines.length === 0) {
    list.innerHTML = `<li class="muted">${t('news.empty')}</li>`;
  } else {
    for (const h of nordic.headlines) list.appendChild(headlineLi(h));
  }
}

export function onMetric(m: { metric: string; ts: number; value: number }): void {
  if (m.metric === 'gdelt_nordic_vol24h') renderNewsMeta(m.value, null);
}

export function onHeadline(h: Headline): void {
  const list = document.getElementById('headlines')!;
  list.querySelector('.muted')?.remove();
  list.prepend(headlineLi(h));
  while (list.children.length > 20) list.lastElementChild!.remove();
}

function renderNewsMeta(vol: number | null, median: number | null): void {
  if (vol === null) return;
  const el = document.getElementById('news-meta')!;
  el.textContent = t('news.meta', {
    n: fmtNum(vol, 0),
    m: median !== null ? fmtNum(median, 0) : '…',
  });
}

function headlineLi(h: Headline): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = h.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = h.title;
  const src = document.createElement('span');
  src.className = 'src';
  src.textContent = `${h.source ?? ''} · ${new Date(h.ts).toLocaleString()}`;
  li.append(a, src);
  return li;
}
