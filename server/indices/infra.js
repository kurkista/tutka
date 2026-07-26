// @ts-check
// indices/infra.js — the Civic & Critical Infrastructure Index: how much
// cyberattack/grid/water/telecom-disruption pressure GDELT is detecting
// around Finland/Baltic keywords. NCSC-FI's warnings RSS feeds in as
// headlines (see pollers/ncscfi.js) but isn't scored into the index — same
// "shown, not scored" treatment as domain 1's AIS/OpenSky layer.
// METHODOLOGY.md documents the rationale.
//
// v1: deviation-scored against its own trailing history — see ./deviation.js.
import { INFRA, DEVIATION_DAILY } from '../config.js';
import { makeDomainIndex } from './domainIndex.js';

const infra = makeDomainIndex({
  name: 'infra',
  config: INFRA,
  components: [
    { key: 'V', metric: 'gdelt_infra_vol_daily', direction: 'high', zeroIsMissing: true, tuning: DEVIATION_DAILY },
    { key: 'T', metric: 'gdelt_infra_tone', direction: 'low' },
  ],
});

export const computeInfra = infra.compute;
export const gatherAndComputeInfra = infra.gatherAndCompute;
