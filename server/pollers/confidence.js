// @ts-check
// pollers/confidence.js — Statistics Finland Consumer Confidence Indicator
// (StatFin PxWeb table kbar/11cc, series CCI_A1). Domain 5's honest "slow"
// household-mood signal: a real monthly survey, not a news-attention proxy.
import { STATFIN } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollConsumerConfidence() {
  const res = await fetch(STATFIN.confidenceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      query: [
        { code: 'timeperiod_m', selection: { filter: 'top', values: ['6'] } },
        { code: 'contentscode', selection: { filter: 'item', values: ['CCI_A1'] } },
      ],
      response: { format: 'json-stat2' },
    }),
  });
  if (!res.ok) throw new Error(`statfin confidence ${res.status}`);
  const data = await res.json();
  const months = Object.keys(data.dimension.timeperiod_m.category.index);
  for (let i = 0; i < months.length; i++) {
    const v = data.value[i];
    if (typeof v === 'number') {
      putSeries('social_consumer_confidence', Date.parse(months[i].replace('M', '-') + '-01'), v);
    }
  }
  const lastTs = Date.parse(months[months.length - 1].replace('M', '-') + '-01');
  bus.emit('metric', { metric: 'social_consumer_confidence', ts: lastTs, value: data.value[months.length - 1] });
}
