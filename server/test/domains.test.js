// @ts-check
// Per-domain wiring. The scoring maths lives in deviation.test.js and the
// factory behaviour in domainIndex.test.js; what's domain-specific from v1 is
// only *configuration*, so that is what this asserts — one table instead of
// the five near-identical per-domain files v0 carried (which between them
// still left domain 4 untested).
import test from 'node:test';
import assert from 'node:assert/strict';
import { NORDIC, HYBRID, INFOENV, INFRA, SOCIAL, CLIMATE, DEVIATION_BANDS } from '../config.js';

const DOMAINS = [
  { n: 1, name: 'nordic', config: NORDIC, keys: ['V', 'T'] },
  { n: 2, name: 'hybrid', config: HYBRID, keys: ['V', 'T'] },
  { n: 3, name: 'infoenv', config: INFOENV, keys: ['V', 'T'] },
  { n: 4, name: 'infra', config: INFRA, keys: ['V', 'T'] },
  { n: 5, name: 'social', config: SOCIAL, keys: ['V', 'T', 'C'] },
  { n: 6, name: 'climate', config: CLIMATE, keys: ['V', 'T', 'F'] },
];

for (const { n, name, config, keys } of DOMAINS) {
  test(`domain ${n} (${name}): config is coherent`, () => {
    assert.equal(config.version, `${name}-v1`, 'version must be bumped with the formula change');
    assert.equal(config.bands, DEVIATION_BANDS, 'all v1 domains share one band vocabulary');

    // Weights must cover exactly the declared components and sum to 1, or the
    // engine's renormalization is quietly rescaling against a wrong total.
    assert.deepEqual(Object.keys(config.weights).sort(), [...keys].sort());
    const sum = Object.values(config.weights).reduce((a, b) => a + Number(b), 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}, expected 1`);

    // Every component needs a staleness rule; a missing one reads as
    // `undefined` and would make the freshness gate always fail.
    for (const k of keys) {
      assert.equal(typeof config.stalenessMs[k], 'number', `stalenessMs.${k} missing`);
    }

    assert.ok(config.deviation, 'v1 domains must carry deviation tuning');
    assert.ok(config.deviation.zSpan > 0);
    assert.ok(config.deviation.minSpanMs > 0);
  });
}

test('no v0 level-scoring constants survive in any domain config', () => {
  // toneExtreme/newsLog10Span/confidenceMin drove the saturated v0 formula.
  // Leaving them behind would invite a future edit to "restore" it.
  for (const { name, config } of DOMAINS) {
    for (const dead of ['newsLog10Span', 'toneCalm', 'toneExtreme', 'confidenceMin', 'confidenceMax']) {
      assert.ok(!(dead in config), `${name} still carries v0's ${dead}`);
    }
  }
});
