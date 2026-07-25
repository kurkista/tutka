// @ts-check
// indices/climate.js — the Environmental & Climate Security Index: how much
// wildfire/drought/extreme-weather-driven security pressure GDELT is
// detecting around Finland/Baltic keywords, combined with NASA FIRMS's
// active-fire hotspot count — a third, genuinely independent signal, same
// precedent as social.js's StatFin C. METHODOLOGY.md documents the rationale.
//
// v1: F is deviation-scored like everything else. v0 used
// `100 - 5·hotspotCount`, which saturated at 0 from 20 hotspots up — and 20+
// VIIRS detections over Finland and the Baltics is an ordinary northern
// July. That made this a season detector, and its ELEVATED reading the only
// non-CALM signal on the whole site. Comparing the count to its own trailing
// 30 days compares July to July, which is the seasonal fix.
import { CLIMATE } from '../config.js';
import { makeDomainIndex } from './domainIndex.js';

const climate = makeDomainIndex({
  name: 'climate',
  config: CLIMATE,
  components: [
    { key: 'V', metric: 'gdelt_climate_vol24h', direction: 'high', zeroIsMissing: true },
    { key: 'T', metric: 'gdelt_climate_tone', direction: 'low' },
    { key: 'F', metric: 'firms_hotspot_count', direction: 'high' },
  ],
});

export const computeClimate = climate.compute;
export const gatherAndComputeClimate = climate.gatherAndCompute;
