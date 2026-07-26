// @ts-check
// indices/hybrid.js — the Hybrid & Grey-Zone Threats Index: how much GPS/GNSS
// jamming, cable/pipeline sabotage, drone-incursion, and instrumentalized-
// migration pressure GDELT is detecting around Finland/Baltic keywords.
// Rajavartiolaitos's press-release RSS feeds in as headlines (see
// pollers/rajavartiolaitos.js) but isn't scored into the index — same "shown,
// not scored" treatment as domain 4's advisory feeds. METHODOLOGY.md
// documents the rationale, including why no third scored component exists
// here the way domain 5 got one.
//
// v1: deviation-scored against its own trailing history — see ./deviation.js.
import { HYBRID, DEVIATION_DAILY } from '../config.js';
import { makeDomainIndex } from './domainIndex.js';

const hybrid = makeDomainIndex({
  name: 'hybrid',
  config: HYBRID,
  components: [
    { key: 'V', metric: 'gdelt_hybrid_vol_daily', direction: 'high', zeroIsMissing: true, tuning: DEVIATION_DAILY },
    { key: 'T', metric: 'gdelt_hybrid_tone', direction: 'low' },
  ],
});

export const computeHybrid = hybrid.compute;
export const gatherAndComputeHybrid = hybrid.gatherAndCompute;
