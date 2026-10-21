// Live release gate: the runtime HTTP policy, no recordings or fallback reads.
import assert from 'node:assert/strict';
import { sources } from '../src/registry.js';
import { UptimeService } from '../src/uptime.js';

const ids = ['ai21', 'augment', 'warp', 'baseten', 'tavus', 'assemblyai'];
const service = new UptimeService(sources.filter(s => ids.includes(s.id)));
try {
  for (const id of ids) {
    const company = (await service.get(id))!;
    const headline = company.components.find(c => c.name === company.primary);
    assert.ok(headline, `${id}: ${company.note ?? 'missing headline'}`);
    assert.match(headline.name, sources.find(s => s.id === id)!.primaryComponent!);
    assert.equal(typeof headline.pct90, 'number', `${id}: no published pct90`);
    assert.equal(headline.days.length, 90, `${id}: incomplete daily history`);
    assert.ok(headline.days.every(day => day.level !== 'unknown'), `${id}: unknown history`);
    console.log(`${id}: ${headline.name} | pct90=${headline.pct90}% | days=${headline.days.length} | ${headline.days[0].date}..${headline.days.at(-1)!.date}`);
  }
} finally { service.stop(); }
