// @ts-check
// indices/social.js — the Social Stability Index: how much polarization/
// unrest pressure GDELT is detecting around Finland/Baltic keywords,
// combined with Statistics Finland's monthly Consumer Confidence Indicator —
// a real household-mood survey, not a news-attention proxy. METHODOLOGY.md
// documents the rationale.
//
// v1: every component including C is deviation-scored against its own
// history — see ./deviation.js. C previously used a hand-picked -20..+20
// span that the config itself flagged as a placeholder; CCI_A1 runs monthly
// back to 1995M10, so a four-year rolling window is real distribution rather
// than an assumed one.
import { SOCIAL, DEVIATION_MONTHLY } from '../config.js';
import { makeDomainIndex } from './domainIndex.js';

const social = makeDomainIndex({
  name: 'social',
  config: SOCIAL,
  components: [
    { key: 'V', metric: 'gdelt_social_vol24h', direction: 'high', zeroIsMissing: true },
    { key: 'T', metric: 'gdelt_social_tone', direction: 'low' },
    // Falling consumer confidence is the concerning direction.
    { key: 'C', metric: 'social_consumer_confidence', direction: 'low', tuning: DEVIATION_MONTHLY },
  ],
});

export const computeSocial = social.compute;
export const gatherAndComputeSocial = social.gatherAndCompute;
