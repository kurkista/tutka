export interface Vessel {
  mmsi: number;
  name: string | null;
  type: number | null;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  hdg: number | null;
  seen: number;
}

export interface Aircraft {
  icao: string;
  cs: string | null;
  lon: number;
  lat: number;
  alt: number | null;
  trk: number | null;
}

/** What server/indices/deviation.js puts in a v1 component's `raw`. */
export interface DeviationRaw {
  value: number;
  samples: number;
  baselineMedian: number;
  baselineMad: number;
  baselineN: number;
  baselineDays: number;
  z: number;
  anomaly: 'high' | 'low' | 'normal';
  direction: 'high' | 'low';
}

export interface IndexComponent {
  score: number;
  raw: Partial<DeviationRaw> & Record<string, unknown>;
  ts: number;
}

/** Dormant Hormuz's index snapshot shape — kept for type completeness only; no longer surfaced live. */
export interface HpiSnapshot {
  ts: number;
  hpi: number;
  band: string;
  components: Record<string, IndexComponent>;
  used?: string[];
  version: string;
}

/** A generic index_snapshots row (nordic, infoenv) — field is `value`. */
export interface IndexSnapshot {
  ts: number;
  value: number;
  band: string;
  components: Record<string, IndexComponent>;
  // Why a component listed in a domain's componentKeys is absent from
  // `components` above — 'no_data' (nothing in window), 'stale' (last
  // reading too old), or 'baseline' (not enough history yet for a trailing
  // baseline). Absent from this map too means the component was never even
  // attempted (shouldn't happen for a domain's own componentKeys).
  dropped?: Record<string, 'no_data' | 'stale' | 'baseline'>;
  version: string;
}

export interface MetricPoint {
  ts: number;
  value: number;
}

export interface Headline {
  ts: number;
  title: string;
  url: string;
  source: string | null;
  /** Only present on the SSE 'headline' event, not on /api/state's per-module lists. */
  module?: string;
}

export interface DomainEvent {
  ts: string;
  type: string;
  en: string;
  fi: string;
  url: string;
}

/** The public event log (Tier 1) — persisted band flips, deviation spikes,
 * and advisory items. Named distinctly from `DomainEvent` above (the
 * hand-authored editorial timeline markers) — see server/db.js's comment on
 * the `events` table for the full naming rationale. */
export interface PublicEvent {
  id: number;
  ts: number;
  type: 'band_change' | 'deviation_spike' | 'advisory' | 'official_statement';
  /** A domain key for domain-scoped events, or a STATEMENTS.sources key
   * (e.g. 'fed', 'nasa') for official-statement events, which aren't
   * domain-scoped. */
  module: 'nordic' | 'hybrid' | 'infoenv' | 'infra' | 'social' | 'climate' | string;
  detail: Record<string, unknown>;
}

export interface AisStatus {
  disabled: boolean;
  connected: boolean;
  lastMsgTs: number | null;
  msgCount: number;
  streaming: boolean;
}

/** Domain 1: Nordic tension. No transitsToday — gate-crossing detection is
 * disabled (no chokepoint geometry in the open Baltic), so that field would
 * be a permanently-fabricated zero rather than an honest omission. */
export interface NordicModule {
  index: IndexSnapshot | null;
  vessels: Vessel[];
  uniqueLargeToday: { tankers: number; cargo: number };
  headlines: Headline[];
  events: DomainEvent[];
  flights: { ts: number; aircraft: Aircraft[] };
  ais: AisStatus;
}

export interface InfoenvModule {
  index: IndexSnapshot | null;
  headlines: Headline[];
  events: DomainEvent[];
}

/** Shared shape for domains 2/4/5/6 — a GDELT V/T index (plus an optional
 * third scored component) and headlines; advisories only exist for domains
 * whose independent feed is shown-not-scored (2, 4, 6 — not 5). */
export interface GenericDomainModule {
  index: IndexSnapshot | null;
  headlines: Headline[];
  advisories?: Headline[];
}

export interface AppState {
  ts: number;
  jobs: Record<string, { lastSuccess: number | null; lastError: number | null; lastErrorMsg: string | null }>;
  metrics: Record<string, MetricPoint>;
  modules: {
    nordic: NordicModule;
    infoenv: InfoenvModule;
    infra: GenericDomainModule;
    social: GenericDomainModule;
    hybrid: GenericDomainModule;
    climate: GenericDomainModule;
  };
}

export type SeriesData = [number, number][];
