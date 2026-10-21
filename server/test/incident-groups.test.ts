import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incidentComponents, incidentUptime } from '../src/uptime.js';
import { sources } from '../src/registry.js';

// ElevenLabs' incident.io page, 2026-10-21: an empty flat list, the parts inside groups in the page layout
const grouped = {
  components: [], data_available_since: '2026-01-01T00:00:00Z',
  structure: { items: [
    { group: { name: 'ElevenAPI', components: [{ component_id: 'a1', name: 'Other APIs' }, { component_id: 'a2', name: 'Speech to Text' }, { component_id: 'a3', name: 'Text to Speech' }] } },
    { group: { name: 'ElevenAgents', components: [{ component_id: 'b1', name: 'Conversations' }, { component_id: 'b2', name: 'Other APIs' }, { component_id: 'b3', name: 'Hidden', hidden: true }] } },
    { component: { component_id: 'c1', name: 'Dashboard' } },
  ] },
};

test('incident.io parts listed only in groups are read from the page layout; shared names get their group', () => {
  assert.deepEqual(incidentComponents(grouped), [
    { id: 'a1', name: 'ElevenAPI: Other APIs' }, { id: 'a2', name: 'Speech to Text' }, { id: 'a3', name: 'Text to Speech' },
    { id: 'b1', name: 'Conversations' }, { id: 'b2', name: 'ElevenAgents: Other APIs' }, { id: 'c1', name: 'Dashboard' },
  ]);
  const flat = { components: [{ id: 'x', name: 'API' }] };
  assert.equal(incidentComponents(flat), flat.components); // a page with a flat list is read as before
});

test('ElevenLabs gets its uptime again from a grouped page', () => {
  const source = sources.find(s => s.id === 'elevenlabs')!;
  const now = Date.parse('2026-10-21T12:00:00Z');
  const body = JSON.stringify({ component_uptimes: [{ component_id: 'a3', uptime: '99.95', data_available_since: '2026-01-01T00:00:00Z' }], component_impacts: [], incident_links: [] });
  const result = incidentUptime(body, grouped, source, now);
  const tts = result.find(c => c.name === 'Text to Speech')!;
  assert.ok(tts); assert.equal(tts.days.length, 90); assert.ok(tts.pct90! > 99.9);
});
