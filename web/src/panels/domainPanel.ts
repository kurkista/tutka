// panels/domainPanel.ts — one generic deep-dive renderer shared by domains
// 2 (hybrid), 4 (infra), 5 (social) and 6 (climate): all four expose the same
// {index, headlines, advisories?} shape from /api/state (see types.ts's
// GenericDomainModule), so unlike domain 1 (map/live-layers) or domain 3
// (first hand-written, kept as-is) they don't need their own file — same
// "one engine, per-domain config" idea the backend already uses in
// indices/engine.js. Each domain still gets its own DOM ids (passed in via
// `key`) so a domain-specific extra widget (Fingrid traffic lights, FIRMS
// hotspot count, consumer confidence) can live alongside this in index.html
// without this module needing to know about it.
import type * as echarts from 'echarts/core';
import type { GenericDomainModule, IndexSnapshot, Headline } from '../types';
import { t, fmtNum } from '../i18n';
import { makeGauge, setGauge, bindResize } from '../charts';

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
 */
export function createDomainPanel(
  key: string,
  componentKeys: readonly string[],
  hasAdvisories: boolean,
): DomainPanelController {
  let gauge: echarts.ECharts;

  function renderIndex(snapshot: IndexSnapshot | null): void {
    const bandEl = document.getElementById(`${key}-band`)!;
    bandEl.textContent = snapshot
      ? `${t('band.' + snapshot.band)} · ${Math.round(snapshot.value)}`
      : t('status.warming');

    if (snapshot) setGauge(gauge, snapshot.value);

    const list = document.getElementById(`${key}-components`)!;
    list.innerHTML = '';
    for (const ck of componentKeys) {
      const li = document.createElement('li');
      const c = snapshot?.components[ck];
      if (c) {
        li.innerHTML = `<span>${t('comp.' + ck)}</span><span class="val">${fmtNum(c.score, 0)}</span>`;
        li.title = JSON.stringify(c.raw);
      } else {
        li.innerHTML = `<span>${t('comp.' + ck)}</span><span class="stale">${t('comp.stale')}</span>`;
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
      for (const h of items) list.appendChild(headlineLi(h));
    }
  }

  function prependTo(listId: string, h: Headline): void {
    const list = document.getElementById(listId)!;
    list.querySelector('.muted')?.remove();
    list.prepend(headlineLi(h));
    while (list.children.length > 20) list.lastElementChild!.remove();
  }

  return {
    init(mod: GenericDomainModule): void {
      gauge = makeGauge(document.getElementById(`${key}-gauge`)!);
      renderIndex(mod.index);
      bindResize(gauge);
      renderList(`${key}-headlines`, mod.headlines);
      if (hasAdvisories) renderList(`${key}-advisories`, mod.advisories ?? []);
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
