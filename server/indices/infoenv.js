// @ts-check
// indices/infoenv.js — the Information Environment Index: how much
// disinformation/influence-operation pressure GDELT is detecting around
// Finland/Baltic keywords. Deliberately two honest signals — no attempt to
// mirror HPI's four-component shape. METHODOLOGY.md documents the rationale.
//
// v1: scoring moved from "level vs a frozen calendar-2025 baseline" to
// "deviation from this metric's own trailing 30 days" — see ./deviation.js
// for why v0 was arithmetically pinned at CALM.
import { INFOENV } from '../config.js';
import { makeDomainIndex } from './domainIndex.js';

const infoenv = makeDomainIndex({
  name: 'infoenv',
  config: INFOENV,
  components: [
    { key: 'V', metric: 'gdelt_infoenv_vol24h', direction: 'high', zeroIsMissing: true },
    { key: 'T', metric: 'gdelt_infoenv_tone', direction: 'low' },
  ],
});

export const computeInfoEnv = infoenv.compute;
export const gatherAndComputeInfoEnv = infoenv.gatherAndCompute;
