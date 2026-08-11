// @ts-check
// pxweb.js — Finnish CPI annual change (inflation, %) from Statistics Finland
// PxWeb table 122p. The honest "slow" national indicator: strait effects take
// months to reach it, and many other things move it too.
import { STATFIN } from '../config.js';
import { putSeries } from '../db.js';
import { bus } from '../bus.js';

export async function pollCpi() {
  const res = await fetch(STATFIN.cpiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      query: [
        { code: 'timeperiod_m', selection: { filter: 'top', values: ['24'] } },
      ],
      response: { format: 'json-stat2' },
    }),
  });
  if (!res.ok) throw new Error(`statfin cpi ${res.status}`);
  const data = await res.json();
  const months = Object.keys(data.dimension.timeperiod_m.category.index);
  for (let i = 0; i < months.length; i++) {
    const v = data.value[i];
    if (typeof v === 'number') {
      putSeries('fi_cpi_yoy', Date.parse(months[i].replace('M', '-') + '-01'), v);
    }
  }
  const lastTs = Date.parse(months[months.length - 1].replace('M', '-') + '-01');
  bus.emit('metric', { metric: 'fi_cpi_yoy', ts: lastTs, value: data.value[months.length - 1] });
}

// Unemployment rate (Labour Force Survey, StatFin table tyti/135z) — a plain
// monthly rate, not seasonally adjusted, matching how fi_cpi_yoy is also the
// raw published figure rather than a smoothed series.
export async function pollUnemployment() {
  const res = await fetch(STATFIN.unemploymentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      query: [
        { code: 'timeperiod_m', selection: { filter: 'top', values: ['6'] } },
        { code: 'contentscode', selection: { filter: 'item', values: ['tyti-Tyottomyysaste'] } },
      ],
      response: { format: 'json-stat2' },
    }),
  });
  if (!res.ok) throw new Error(`statfin unemployment ${res.status}`);
  const data = await res.json();
  const months = Object.keys(data.dimension.timeperiod_m.category.index);
  for (let i = 0; i < months.length; i++) {
    const v = data.value[i];
    if (typeof v === 'number') {
      putSeries('fi_unemployment_rate', Date.parse(months[i].replace('M', '-') + '-01'), v);
    }
  }
  const lastTs = Date.parse(months[months.length - 1].replace('M', '-') + '-01');
  bus.emit('metric', { metric: 'fi_unemployment_rate', ts: lastTs, value: data.value[months.length - 1] });
}

// Food & non-alcoholic beverages CPI sub-index (StatFin table khi/15b5,
// coicop "01", 2025=100) — the honest stand-in for "ostoskorin hinta": a real
// official point figure, not an invented basket. Fetches 60 months so the
// HOUSEHOLD pre-crisis reference month stays in range as time passes, same
// reasoning as pump.js's fuel-price fetch.
export async function pollGroceryPrice() {
  const res = await fetch(STATFIN.groceryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      query: [
        { code: 'timeperiod_m', selection: { filter: 'top', values: ['60'] } },
        { code: 'coicop_46_20231201', selection: { filter: 'item', values: ['01'] } },
        { code: 'contentscode', selection: { filter: 'item', values: ['ip_khi'] } },
      ],
      response: { format: 'json-stat2' },
    }),
  });
  if (!res.ok) throw new Error(`statfin grocery ${res.status}`);
  const data = await res.json();
  const months = Object.keys(data.dimension.timeperiod_m.category.index);
  for (let i = 0; i < months.length; i++) {
    const v = data.value[i];
    if (typeof v === 'number') {
      putSeries('fi_grocery_cpi', Date.parse(months[i].replace('M', '-') + '-01'), v);
    }
  }
  const lastTs = Date.parse(months[months.length - 1].replace('M', '-') + '-01');
  bus.emit('metric', { metric: 'fi_grocery_cpi', ts: lastTs, value: data.value[months.length - 1] });
}
