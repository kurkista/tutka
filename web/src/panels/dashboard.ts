// panels/dashboard.ts — home view. Answers "what is unusual right now",
// which is a question that still has a real answer on a quiet day; v0 asked
// "what is the level" and, because every index was pinned at its ceiling,
// could only ever answer CALM six times in identical grey.
//
// Two deliberate changes from v0's card:
//   - the descriptive blurb is *kept*. v0 overwrote it with the band word as
//     soon as an index existed, so the landing page got less informative the
//     moment data arrived.
//   - the score the backend computes is actually shown, with a 30-day
//     sparkline and a plain sentence naming what moved.
import type { AppState, IndexSnapshot } from '../types';
import { t } from '../i18n';
import { getSeries } from '../api';
import { makeSimpleSparkline } from '../charts';
import { readingFor, readingLabel, type Reading } from '../reading';

interface DomainMeta {
  n: number;
  nameKey: string;
  summaryKey: string;
  /** AppState.modules key and the `<name>_index` series prefix. */
  moduleKey: 'nordic' | 'infoenv' | 'infra' | 'social' | 'hybrid' | 'climate';
}

const DOMAINS: DomainMeta[] = [
  { n: 1, nameKey: 'domain.1.name', summaryKey: 'domain.1.summary', moduleKey: 'nordic' },
  { n: 2, nameKey: 'domain.2.name', summaryKey: 'domain.2.summary', moduleKey: 'hybrid' },
  { n: 3, nameKey: 'domain.3.name', summaryKey: 'domain.3.summary', moduleKey: 'infoenv' },
  { n: 4, nameKey: 'domain.4.name', summaryKey: 'domain.4.summary', moduleKey: 'infra' },
  { n: 5, nameKey: 'domain.5.name', summaryKey: 'domain.5.summary', moduleKey: 'social' },
  { n: 6, nameKey: 'domain.6.name', summaryKey: 'domain.6.summary', moduleKey: 'climate' },
];

export function init(state: AppState): void {
  const rows = DOMAINS.map((d) => {
    const index = state.modules[d.moduleKey].index as IndexSnapshot | null;
    return { meta: d, index, reading: readingFor(index) };
  });

  renderSynthesis(rows);
  renderCards(rows);
  // Sparklines are a bonus on top of a card that already reads correctly, so
  // they load after first paint rather than blocking it.
  void loadSparklines(rows);
}

type Row = { meta: DomainMeta; index: IndexSnapshot | null; reading: Reading };

function renderSynthesis(rows: Row[]): void {
  const title = document.getElementById('synthesis-title')!;
  const el = document.getElementById('synthesis-coverage')!;

  const reporting = rows.filter((r) => r.index);
  const building = rows.length - reporting.length;
  // Rank by score so the lead is whichever domain is furthest from its own
  // normal — the ordering the page's question implies.
  const ranked = [...reporting].sort((a, b) => (b.index!.value) - (a.index!.value));
  const lead = ranked[0];

  const parts: string[] = [];

  if (lead && lead.index!.band !== 'NORMAL') {
    title.textContent = t('dashboard.leadUnusual');
    parts.push(`${t(lead.meta.nameKey)} — ${readingLabel(lead.reading)}. ${lead.reading.detail}.`);
  } else {
    title.textContent = t('dashboard.leadCalm');
    parts.push(t('dashboard.calmBody', { n: reporting.length }));
  }

  if (building > 0) parts.push(t('dashboard.building', { n: building }));
  parts.push(t('dashboard.baselineNote'));

  // Each part is a standalone sentence; some already end in punctuation
  // (the lead ends with the driver clause), so only add a stop where one is
  // missing rather than emitting "…a baseline Each domain is…".
  el.textContent = parts.map((s) => (/[.!?]$/.test(s) ? s : `${s}.`)).join(' ');
}

function renderCards(rows: Row[]): void {
  const grid = document.getElementById('domain-cards')!;
  grid.innerHTML = '';

  for (const row of rows) {
    const { meta, index, reading } = row;
    const btn = document.createElement('button');
    btn.className = 'domain-card';
    btn.dataset.domain = String(meta.n);

    const bandClass = index ? `band-${index.band}` : 'band-none';
    btn.innerHTML = `
      <div class="domain-card-top">
        <span class="domain-num">${t('dashboard.domainLabel', { n: meta.n })}</span>
        <span class="domain-reading ${bandClass}">${readingLabel(reading)}</span>
      </div>
      <p class="domain-name">${t(meta.nameKey)}</p>
      <p class="domain-detail${reading.suspectFeed ? ' is-suspect' : ''}">${reading.detail}</p>
      <div class="domain-spark" data-spark="${meta.moduleKey}"></div>
      <p class="domain-summary">${t(meta.summaryKey)}</p>
    `;
    btn.addEventListener('click', () => { location.hash = `#domain/${meta.n}`; });
    grid.appendChild(btn);
  }
}

async function loadSparklines(rows: Row[]): Promise<void> {
  await Promise.all(rows.map(async (row) => {
    const el = document.querySelector<HTMLElement>(`[data-spark="${row.meta.moduleKey}"]`);
    if (!el) return;
    const data = await getSeries(`${row.meta.moduleKey}_index`, 30).catch(() => []);
    // Two points draw a meaningless straight line; leave the slot empty
    // rather than implying a trend that isn't there.
    if (data.length < 3) { el.remove(); return; }
    makeSimpleSparkline(el, data);
  }));
}
