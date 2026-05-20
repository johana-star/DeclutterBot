// test_uid.js — Tests for uid() uniqueness and collision guard
// Run with: node tests/test_uid.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
global.addBotMessage    = function() {};
global.addUserMessage   = function() {};
global.setChips         = function() {};
global.renderSidebar    = function() {};
global.updateContextBar = function() {};
global.showTyping       = function() {};
global.hideTyping       = function() {};
global.saveState        = function() {};
global.chipClick        = function() {};
global.escHtml          = function(s) { return String(s || ''); };
global.renderMarkdown   = function(s) { return s; };
global.localStorage     = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };

const app       = require('../app.js');
const state     = app.state;
const uid       = app.uid;
const issuedIds = app.issuedIds;

// ── HARNESS ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  issuedIds.clear();
}

// Base-36 single-character alphabet: 0-9 + a-z = 36 possible values
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');

// Populate state with n of the 36 possible single-char ids as box ids
function populateIds(ids) {
  state.boxes = ids.map((id) => ({
    id,
    name: 'box ' + id,
    location: 'garage',
    notes: '',
    parentId: null,
    deleted_at: null,
    createdAt: new Date().toISOString(),
    items: []
  }));
}

console.log('\nuid() uniqueness\n');

console.log('1. uid() returns a 7-character base-36 string by default');
reset();
const sample = uid();
assert('7 characters', sample.length === 7);
assert('base-36 characters only', /^[0-9a-z]{7}$/.test(sample));

console.log('\n2. uid(1) returns a 1-character base-36 string');
reset();
const short = uid(1);
assert('1 character', short.length === 1);
assert('base-36 character', /^[0-9a-z]$/.test(short));

console.log('\n3. With 35 of 36 single-char ids in use, uid(1) returns the one remaining');
reset();
// Leave out one id — use the last one as the expected result
const remaining = BASE36[BASE36.length - 1]; // 'z'
populateIds(BASE36.slice(0, BASE36.length - 1)); // all except 'z'
const result = uid(1);
assert('returns the only available id', result === remaining);

console.log('\n4. uid(1) never collides with existing box ids');
reset();
// Use first 20 of 36 as existing ids
populateIds(BASE36.slice(0, 20));
const existing = new Set(BASE36.slice(0, 20));
// Generate ids to fill the remaining 16 slots
const generated = new Set();
for (let i = 0; i < 16; i++) { generated.add(uid(1)); }
const collisions = [...generated].filter((id) => existing.has(id));
assert('no collisions with existing box ids', collisions.length === 0);

console.log('\n5. uid(1) never collides with existing item ids');
reset();
// Put the first 20 ids on items (not boxes)
state.boxes.push({
  id: 'box001',
  name: 'test box',
  location: 'garage',
  notes: '',
  parentId: null,
  deleted_at: null,
  createdAt: new Date().toISOString(),
  items: BASE36.slice(0, 20).map((id) => ({
    id,
    name: 'item ' + id,
    fate: 'keep',
    notes: '',
    deleted_at: null
  }))
});
const existingItems = new Set(BASE36.slice(0, 20));
const generatedFromItems = new Set();
// Generate 15 more (leaving 1 slot free to avoid infinite loop)
for (let i = 0; i < 15; i++) { generatedFromItems.add(uid(1)); }
const itemCollisions = [...generatedFromItems].filter((id) => existingItems.has(id));
assert('no collisions with existing item ids', itemCollisions.length === 0);

console.log('\n6. 20 sequential uid(1) calls with empty state produce no duplicates');
reset();
const sequentialIds = new Set();
for (let i = 0; i < 20; i++) {
  const newId = uid(1);
  // Each new id is immediately "in use" since uid reads from state,
  // so we simulate that by adding it to a box after each call
  state.boxes.push({
    id: newId,
    name: 'box ' + newId,
    location: 'garage',
    notes: '',
    parentId: null,
    deleted_at: null,
    createdAt: new Date().toISOString(),
    items: []
  });
  sequentialIds.add(newId);
}
assert('20 unique ids generated sequentially', sequentialIds.size === 20);

console.log('\n7. uid() registers generated ids in issuedIds ledger');
reset();
const before = issuedIds.size;
const newId = uid(1);
assert('id added to issuedIds', issuedIds.has(newId));
assert('ledger grew by 1', issuedIds.size === before + 1);

console.log('\n8. uid(1) never re-issues an id already in issuedIds even if not in state');
reset();
// Generate an id, do NOT add it to state, then verify it is never re-issued
const firstId = uid(1);
// issuedIds has firstId; state does not
const subsequent = new Set();
for (let i = 0; i < 34; i++) { subsequent.add(uid(1)); }
assert('first id never re-issued', !subsequent.has(firstId));

console.log('\n9. uid(1) throws when ID space is exhausted');
reset();
// Fill all 36 single-char ids into issuedIds
BASE36.forEach((id) => issuedIds.add(id));
let threw = false;
try { uid(1); } catch (e) { threw = true; }
assert('throws on exhausted space', threw);

console.log('\n10. Error message identifies the exhausted length and space size');
reset();
BASE36.forEach((id) => issuedIds.add(id));
let errorMessage = '';
try { uid(1); } catch (e) { errorMessage = e.message; }
assert('error mentions length', errorMessage.includes('length 1'));
assert('error mentions space size', errorMessage.includes('36'));

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
