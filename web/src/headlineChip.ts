// headlineChip.ts — shared headline/advisory row renderer for every deep-dive
// panel.
//
// v0 hashed the source name into one of seven colours. That looked like an
// encoding but carried no information: the hash means nothing, ~10 sources
// into 7 buckets collide constantly, so two unrelated outlets share a colour
// while the reader is invited to believe it signifies something. On a site
// whose whole premise is separating signal from normal, a decorative channel
// dressed as a semantic one is the wrong trade.
//
// Colouring by article tone would have been real signal — but GDELT's artlist
// mode returns `tone: null` for every row (checked against the live API), so
// there is nothing to encode. Until there is, the chip carries structure and
// recency instead, and no colour claim at all.
import type { Headline } from './types';
import { fmtDate, fmtTime } from './i18n';

export function headlineChip(h: Headline): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'headline-chip';

  const a = document.createElement('a');
  a.href = h.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = h.title;

  const src = document.createElement('span');
  src.className = 'src';
  // Locale-aware, and consistent with every other timestamp on the site —
  // v0 used raw toLocaleString() here, which ignored the language toggle.
  src.textContent = [h.source, `${fmtDate(h.ts)} ${fmtTime(h.ts)}`]
    .filter(Boolean)
    .join(' · ');

  li.append(a, src);
  return li;
}
