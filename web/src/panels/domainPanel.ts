// panels/domainPanel.ts — one generic deep-dive renderer shared by domains
// 2 (hybrid), 3 (infoenv), 4 (infra), 5 (social) and 6 (climate): all five
// expose the same {index, headlines, advisories?} shape from /api/state (see
// types.ts's GenericDomainModule), so unlike domain 1 (map/live-layers) they
// don't need their own file — same "one engine, per-domain config" idea the
// backend uses in indices/domainIndex.js. Domain 3 had a hand-written twin of
// this file until v1; it differed only in DOM id prefix. Each domain still gets its own DOM ids (passed in via
// `key`) so a domain-specific extra widget (Fingrid traffic lights, FIRMS
// hotspot count, consumer confidence) can live alongside this in index.html
// without this module needing to know about it.
import type * as echarts from 'echarts/core';
import type { GenericDomainModule, IndexSnapshot, Headline } from '../types';
import { t, fmtNum } from '../i18n';
import { makeGauge, setGauge, makeVTSparkline } from '../charts';
import { getSeries } from '../api';
import { headlineChip } from '../headlineChip';
import { onFirstView, trackChart } from '../lazyView';
import { readingFor, componentWhy } from '../reading';
import { renderRejectedSources } from './methodology';

export interface DomainPanelController {
  init(mod: GenericDomainModule): void;
  onIndex(snapshot: IndexSnapshot): void;
  onHeadline(h: Headline): void;
  onAdvisory(h: Headline): void;
}

/**
 * @param key DOM id prefix, e.g. 'infra' → #infra-gauge, #infra-components, ...
 * @param componentKeys index component keys in display order, e.g. ['V','T'] or ['V','T','C']
 * @param hasAdvisories whether this domain has a separate #{key}-advisories list
 * @param vtSeriesPrefix if set (e.g. 'gdelt_social_'), fetches 30d volume/tone
 *   history and renders it into #{key}-vt-chart, when the page has that slot.
 * @param view route key this panel's charts belong to, for lazyView
 */
export function createDomainPanel(
  key: string,
  componentKeys: readonly string[],
  hasAdvisories: boolean,
  vtSeriesPrefix?: string,
  view = key,
): DomainPanelController {
  let gauge: echarts.ECharts | null = null;
  let latest: IndexSnapshot | null = null;

  async function buildVTChart(): Promise<void> {
    if (!vtSeriesPrefix) return;
    const el = document.getElementById(`${key}-vt-chart`);
    if (!el) return;
    try {
      const [vol, tone] = await Promise.all([
        getSeries(`${vtSeriesPrefix}vol_daily`),
        getSeries(`${vtSeriesPrefix}tone`),
      ]);
      trackChart(view, makeVTSparkline(el, vol, tone));
    } catch {
      // Replacing the container's innerHTML destroys the mount node, so a
      // retry would have nowhere to render. Use a sibling note instead.
      el.insertAdjacentHTML('afterend', `<p class="fineprint">${t('status.noData')}</p>`);
    }
  }

  function buildGauge(): void {
    gauge = makeGauge(document.getElementById(`${key}-gauge`)!);
    trackChart(view, gauge);
    setGauge(gauge, latest?.value ?? null);
  }

  function renderIndex(snapshot: IndexSnapshot | null): void {
    latest = snapshot;
    const bandEl = document.getElementById(`${key}-band`)!;
    const reading = readingFor(snapshot);
    bandEl.className = snapshot ? `band-line band-${snapshot.band}` : 'band-line';
    bandEl.textContent = snapshot
      ? `${t('band.' + snapshot.band)} · ${Math.round(snapshot.value)} — ${reading.detail}`
      : t('status.warming');

    // The gauge only exists once this domain has been visited; SSE updates
    // arriving before then are held in `latest` and applied on build.
    if (gauge) setGauge(gauge, snapshot?.value ?? null);

    const list = document.getElementById(`${key}-components`)!;
    list.innerHTML = '';
    for (const ck of componentKeys) {
      const li = document.createElement('li');
      const c = snapshot?.components[ck];
      if (c) {
        const why = componentWhy(c);
        li.innerHTML = `<details><summary><span>${t('comp.' + ck)}</span>` +
          `<span class="val">${fmtNum(c.score, 0)}</span></summary>` +
          `<div class="component-why">${why.map((l) => `<p>${l}</p>`).join('')}</div></details>`;
      } else {
        // A missing component means "stale" only when the domain is otherwise
        // reporting. With no snapshot at all the cause is almost always too
        // little history for a baseline, and calling that "stale — excluded"
        // blames the feed for something that is just the domain being young.
        const why = snapshot ? t('comp.stale') : t('card.noBaseline');
        li.innerHTML = `<span>${t('comp.' + ck)}</span><span class="stale">${why}</span>`;
      }
      list.appendChild(li);
    }
  }

  function renderList(listId: string, items: Headline[]): void {
    const list = document.getElementById(listId)!;
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = `<li class="muted">${t('news.empty')}</li>`;
    } else {
      for (const h of items) list.appendChild(headlineChip(h));
    }
  }

  function prependTo(listId: string, h: Headline): void {
    const list = document.getElementById(listId)!;
    list.querySelector('.muted')?.remove();
    list.prepend(headlineChip(h));
    while (list.children.length > 20) list.lastElementChild!.remove();
  }

  return {
    init(mod: GenericDomainModule): void {
      renderIndex(mod.index);
      renderList(`${key}-headlines`, mod.headlines);
      if (hasAdvisories) renderList(`${key}-advisories`, mod.advisories ?? []);
      onFirstView(view, () => { buildGauge(); return buildVTChart(); });
      void renderRejectedSources(key, Number(view));
    },
    onIndex(snapshot: IndexSnapshot): void {
      renderIndex(snapshot);
    },
    onHeadline(h: Headline): void {
      prependTo(`${key}-headlines`, h);
    },
    onAdvisory(h: Headline): void {
      if (hasAdvisories) prependTo(`${key}-advisories`, h);
    },
  };
}
