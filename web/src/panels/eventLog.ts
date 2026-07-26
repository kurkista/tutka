// panels/eventLog.ts — the public event log (Tier 1): persisted band
// changes, deviation spikes, and advisory items, one timestamped,
// permalinked stream. A sibling to headlineChip.ts, not a reuse of it — a
// PublicEvent needs type-specific composed text (via i18n templates, never
// baked into English prose server-side) and a permalink to itself, where a
// Headline just needs a title/source/date and an external link.
import type { PublicEvent } from '../types';
import { t, fmtDate, fmtTime } from '../i18n';
import { getEvents, getEvent } from '../api';

const MODULE_DOMAIN: Record<string, number> = {
  nordic: 1, hybrid: 2, infoenv: 3, infra: 4, social: 5, climate: 6,
};

interface BandChangeDetail { from: string; to: string; value: number }
interface DeviationSpikeDetail { component: string; z: number; value: number; direction: 'high' | 'low' }
interface AdvisoryDetail { title: string; url: string; source: string }

function eventText(e: PublicEvent): string {
  const module = t(`domain.${MODULE_DOMAIN[e.module]}.tab`);
  if (e.type === 'band_change') {
    const d = e.detail as unknown as BandChangeDetail;
    return t('event.bandChange', { module, from: t(`band.${d.from}`), to: t(`band.${d.to}`) });
  }
  if (e.type === 'deviation_spike') {
    const d = e.detail as unknown as DeviationSpikeDetail;
    return t('event.deviationSpike', {
      module,
      component: t(`comp.${d.component}`),
      dir: t(`dir.${d.direction === 'high' ? 'above' : 'below'}`),
    });
  }
  return (e.detail as unknown as AdvisoryDetail).title;
}

function eventChip(e: PublicEvent): HTMLLIElement {
  const li = document.createElement('li');
  li.className = e.type === 'band_change'
    ? `headline-chip band-${(e.detail as unknown as BandChangeDetail).to}`
    : 'headline-chip';

  const a = document.createElement('a');
  a.href = `#event/${e.id}`;
  a.textContent = eventText(e);

  const src = document.createElement('span');
  src.className = 'src';
  src.textContent = `${t(`domain.${MODULE_DOMAIN[e.module]}.tab`)} · ${fmtDate(e.ts)} ${fmtTime(e.ts)}`;

  li.append(a, src);
  return li;
}

function renderList(items: PublicEvent[]): void {
  const list = document.getElementById('events-list')!;
  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML = `<li class="muted">${t('events.empty')}</li>`;
  } else {
    for (const e of items) list.appendChild(eventChip(e));
  }
}

/** Prepends a live event to the list — a no-op when the events view isn't
 * mounted or is currently showing a single-event permalink, since there's
 * no list to prepend into. Wired to the SSE 'event' channel in chunk 4. */
export function prepend(e: PublicEvent): void {
  const backLink = document.getElementById('events-back-link');
  const list = document.getElementById('events-list');
  if (!list || !backLink || !backLink.hidden) return;
  list.querySelector('.muted')?.remove();
  list.prepend(eventChip(e));
  while (list.children.length > 50) list.lastElementChild!.remove();
}

export async function init(): Promise<void> {
  document.getElementById('events-back-link')!.hidden = true;
  renderList(await getEvents());
}

export async function initPermalink(id: number): Promise<void> {
  const list = document.getElementById('events-list')!;
  list.innerHTML = '';
  document.getElementById('events-back-link')!.hidden = false;
  try {
    list.appendChild(eventChip(await getEvent(id)));
  } catch {
    list.innerHTML = `<li class="muted">${t('events.notFound')}</li>`;
  }
}
