// @ts-check
// indices/infra.js — the Civic & Critical Infrastructure Index: how much
// cyberattack/grid/water/telecom-disruption pressure GDELT is detecting
// around Finland/Baltic keywords, combined with Finnish spot electricity
// price — a real grid-economics signal, same precedent as social.js's StatFin
// C and climate.js's FIRMS F. NCSC-FI's warnings RSS still feeds in as
// headlines only (see pollers/ncscfi.js), same "shown, not scored" treatment
// as domain 1's AIS/OpenSky layer. METHODOLOGY.md documents the rationale.
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
    // Price spikes are the concerning direction — dry Nordic hydro
    // reservoirs, gas-driven import costs, nuclear maintenance outages.
    { key: 'P', metric: 'elec_spot', direction: 'high' },
  ],
});

export const computeInfra = infra.compute;
export const gatherAndComputeInfra = infra.gatherAndCompute;
