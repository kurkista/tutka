// @ts-check
// indices/nordic.js — the Nordic Tension Index: domain 1's real content
// (State & military tension) for Finland/Baltic. No clean daily official
// series exists for Nordic military tension the way IMF PortWatch did for
// Hormuz, so GDELT news pressure is the anchor. Live AIS vessels/flights are
// shown as this domain's live layers, not scored — raw vessel/flight counts
// aren't an obviously honest tension signal. METHODOLOGY.md documents the
// rationale.
//
// v1: scoring moved from "level vs a frozen calendar-2025 baseline" to
// "deviation from this metric's own trailing 30 days" — see ./deviation.js
// for why v0 was arithmetically pinned at CALM.
import { NORDIC } from '../config.js';
import { makeDomainIndex } from './domainIndex.js';

const nordic = makeDomainIndex({
  name: 'nordic',
  config: NORDIC,
  components: [
    { key: 'V', metric: 'gdelt_nordic_vol24h', direction: 'high', zeroIsMissing: true },
    { key: 'T', metric: 'gdelt_nordic_tone', direction: 'low' },
  ],
});

export const computeNordic = nordic.compute;
export const gatherAndComputeNordic = nordic.gatherAndCompute;
