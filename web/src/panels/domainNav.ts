// panels/domainNav.ts — the bar across the top of every deep-dive view.
//
// Replaces the lone "← Back to dashboard" button. That button made moving
// between two domains a three-step trip (back, read the grid, click), which is
// the most common thing a reader actually wants to do here — the domains are
// meant to be compared, not visited one at a time.
//
// Deliberately plain: same pill shape as the existing .view-btn / .range-btn
// toggles, no readings and no colour. The dashboard cards are where a domain's
// state is reported; duplicating it here would put two numbers for the same
// thing on screen at once, and they would disagree the moment one updated.
import { t } from '../i18n';

const DOMAIN_NUMBERS = [1, 2, 3, 4, 5, 6];

export function initDomainNav(): void {
  const nav = document.getElementById('domain-nav')!;

  const home = document.createElement('button');
  home.className = 'domain-nav-btn is-home';
  home.textContent = `← ${t('nav.dashboard')}`;
  home.addEventListener('click', () => { location.hash = ''; });
  nav.appendChild(home);

  const events = document.createElement('button');
  events.className = 'domain-nav-btn is-events';
  events.textContent = t('events.title');
  events.addEventListener('click', () => { location.hash = '#events'; });
  nav.appendChild(events);

  const dependencies = document.createElement('button');
  dependencies.className = 'domain-nav-btn is-dependencies';
  dependencies.textContent = t('nav.dependencies');
  dependencies.addEventListener('click', () => { location.hash = '#dependencies'; });
  nav.appendChild(dependencies);

  for (const n of DOMAIN_NUMBERS) {
    const btn = document.createElement('button');
    btn.className = 'domain-nav-btn';
    btn.dataset.domain = String(n);
    // The number is the durable handle — it matches the route (#domain/N), the
    // dashboard card label and how METHODOLOGY.md refers to each domain.
    btn.innerHTML = `<span class="domain-nav-num">${n}</span>${t(`domain.${n}.tab`)}`;
    btn.addEventListener('click', () => { location.hash = `#domain/${n}`; });
    nav.appendChild(btn);
  }
}

/** Mark the open domain, and scroll it into view when the bar overflows. */
export function setActiveDomain(n: number): void {
  const nav = document.getElementById('domain-nav');
  if (!nav) return;

  for (const btn of nav.querySelectorAll<HTMLElement>('.domain-nav-btn[data-domain]')) {
    const active = Number(btn.dataset.domain) === n;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
    // On a phone the bar scrolls horizontally, so the domain you just opened
    // can easily sit off-screen — arriving via a dashboard card, or via 6 → 1.
    if (active) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
