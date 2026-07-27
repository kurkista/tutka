// panels/methodology.ts — renders METHODOLOGY.md (served by the API from the
// same file GitHub shows) into a <dialog>. Same source of truth everywhere.
// Also extracts each domain's "evaluated and rejected" subsection (if any)
// for an inline panel in that domain's deep-dive view — same split idiom
// main.ts's renderPlaceholder already uses for ROADMAP.md.
import { marked } from 'marked';
import { getMethodology } from '../api';

let methodologyMd: Promise<string> | null = null;
function loadMethodologyMd(): Promise<string> {
  if (!methodologyMd) methodologyMd = getMethodology();
  return methodologyMd;
}

function sectionByHeading(md: string, heading: string): string | null {
  const sections = md.split(/^## /m);
  return sections.find((s) => s.startsWith(heading)) ?? null;
}

function rejectedSubsections(section: string): string | null {
  const subs = section.split(/^### /m).filter((s) => /evaluated|rejected/i.test(s.split('\n')[0]));
  return subs.length ? subs.map((s) => '### ' + s).join('\n') : null;
}

/** Un-hides and fills #{key}-rejected if the matching METHODOLOGY.md section
 * has an "evaluated and rejected" subsection; leaves it hidden otherwise —
 * never a "nothing here" filler for sections with no such subsection.
 * `heading` is either a domain number (matches `## Domain N —`) or the exact
 * leading text of a non-numbered `##` heading, e.g. `'Dependency timeline —'`. */
export async function renderRejectedSources(key: string, heading: number | string): Promise<void> {
  const details = document.getElementById(`${key}-rejected`) as HTMLDetailsElement | null;
  if (!details) return;
  const md = await loadMethodologyMd().catch(() => '');
  const headingText = typeof heading === 'number' ? `Domain ${heading} —` : heading;
  const section = md && sectionByHeading(md, headingText);
  const rejected = section && rejectedSubsections(section);
  if (!rejected) return;
  document.getElementById(`${key}-rejected-body`)!.innerHTML = await marked.parse(rejected);
  details.hidden = false;
}

export function initMethodology(): void {
  const link = document.getElementById('methodology-link')!;
  const dialog = document.getElementById('methodology-dialog') as HTMLDialogElement;
  const body = document.getElementById('methodology-body')!;

  link.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!body.childElementCount) {
      const md = await loadMethodologyMd();
      body.innerHTML = await marked.parse(md);
    }
    dialog.showModal();
  });
}
