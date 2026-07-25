// headlineChip.ts — shared headline/advisory row renderer for all deep-dive
// panels (domainPanel.ts's four domains + infoenv.ts's domain 3). Replaces
// the plain <li><a>title</a><span>source</span></li> row with a colored
// left-border chip so a list of 20 headlines reads as more than a wall of
// text — the source name is hashed to a stable color, not looked up from a
// palette, so a new/unlisted source domain never falls back to "uncolored".
import type { Headline } from './types';

const CHIP_COLORS = ['#4fa6a6', '#3987e5', '#c98500', '#9085e9', '#5cab5c', '#c95c8a', '#5c9bc9'];

function colorForSource(source: string | null): string {
  const s = source ?? '';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return CHIP_COLORS[Math.abs(hash) % CHIP_COLORS.length];
}

export function headlineChip(h: Headline): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'headline-chip';
  li.style.setProperty('--chip-color', colorForSource(h.source));
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
