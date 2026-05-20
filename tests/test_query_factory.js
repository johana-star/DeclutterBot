// test_query_factory.js — Tests for queryFactory and named query objects
// Run with: node tests/test_query_factory.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
let lastBotMessage = null;
let lastChips = [];

global.addBotMessage    = function(text) { lastBotMessage = text; };
global.addUserMessage   = function() {};
global.setChips         = function(chips) { lastChips = chips; };
global.renderSidebar    = function() {};
global.updateContextBar = function() {};
global.showTyping       = function() {};
global.hideTyping       = function() {};
global.saveState        = function() {};
global.chipClick        = function() {};
global.escHtml          = function(s) { return String(s || ''); };
global.renderMarkdown   = function(s) { return s; };
global.localStorage     = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };

const app     = require('../app.js');
const state   = app.state;
const queries = app.queries;

// ── HARNESS ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}
function assertIncludes(desc, haystack, needle) {
  assert(desc, haystack != null && haystack.includes(needle));
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(name, location) {
  const box = {
    id: app.uid(),
    name,
    location: location || 'garage',
    notes: '',
    parentId: null,
    createdAt: new Date().toISOString(),
    items: []
  };
  state.boxes.push(box);
  return box;
}

function addItem(box, name, fate, notes) {
  const item = {
    id: app.uid(),
    name,
    fate: fate || 'keep',
    notes: notes || '',
    deleted_at: null,
    createdAt: new Date().toISOString()
  };
  box.items.push(item);
  return item;
}

console.log('\nqueryFactory\n');

// ── items() ───────────────────────────────────────────────────────────────────

console.log('1. items() returns empty array with no matching items');
reset();
makeBox('Empty box');
assert('empty array', queries.donationItems.items().length === 0);

console.log('\n2. items() returns matching items as flat {item, box} pairs');
reset();
const box1 = makeBox('Shelf A');
addItem(box1, 'lamp', 'donate');
addItem(box1, 'chair', 'keep');
addItem(box1, 'rug', 'donate');
const items = queries.donationItems.items();
assert('two donate items returned', items.length === 2);
assert('each entry has item', items.every((entry) => entry.item !== undefined));
assert('each entry has box', items.every((entry) => entry.box !== undefined));
assert('box reference correct', items[0].box.id === box1.id);

console.log('\n3. items() excludes soft-deleted items');
reset();
const box2 = makeBox('Shelf B');
const deleted = addItem(box2, 'deleted lamp', 'donate');
deleted.deleted_at = new Date().toISOString();
addItem(box2, 'active lamp', 'donate');
assert('only active item returned', queries.donationItems.items().length === 1);

console.log('\n4. items() excludes items in soft-deleted boxes');
reset();
const deletedBox = makeBox('Gone shelf');
deletedBox.deleted_at = new Date().toISOString();
addItem(deletedBox, 'lamp', 'donate');
assert('item in deleted box excluded', queries.donationItems.items().length === 0);

console.log('\n5. items(filter) narrows results by string match on name');
reset();
const box3 = makeBox('Mixed shelf');
addItem(box3, 'hdmi cable', 'donate');
addItem(box3, 'usb cable', 'donate');
addItem(box3, 'old lamp', 'donate');
const filtered = queries.donationItems.items('cable');
assert('two cable items returned', filtered.length === 2);
assert('lamp excluded', filtered.every(({ item }) => item.name !== 'old lamp'));

console.log('\n6. items(filter) matches against notes as well as name');
reset();
const box4 = makeBox('Notes shelf');
addItem(box4, 'mystery item', 'donate', 'this is actually a cable');
addItem(box4, 'other item', 'donate', 'no match here');
addItem(box4, 'third item', 'donate');
const notesFiltered = queries.donationItems.items('cable');
assert('item with cable in notes returned', notesFiltered.length === 1);
assertIncludes('correct item returned', notesFiltered[0].item.name, 'mystery item');

console.log('\n7. items(filter) is case-insensitive');
reset();
const box5 = makeBox('Case shelf');
addItem(box5, 'HDMI Cable', 'donate');
addItem(box5, 'usb cable', 'donate');
addItem(box5, 'lamp', 'donate');
assert('uppercase name matched', queries.donationItems.items('hdmi').length === 1);
assert('lowercase filter matches uppercase name', queries.donationItems.items('HDMI').length === 1);

console.log('\n8. items() with no filter returns all matching items');
reset();
const box6 = makeBox('All shelf');
addItem(box6, 'item a', 'donate');
addItem(box6, 'item b', 'donate');
addItem(box6, 'item c', 'keep');
assert('two donate items without filter', queries.donationItems.items().length === 2);

// ── count() ───────────────────────────────────────────────────────────────────

console.log('\n9. count() returns total item count');
reset();
const box7 = makeBox('Count shelf');
addItem(box7, 'item 1', 'donate');
addItem(box7, 'item 2', 'donate');
addItem(box7, 'item 3', 'donate');
assert('count is 3', queries.donationItems.count() === 3);

console.log('\n10. count() returns 0 with no matching items');
reset();
makeBox('Empty');
assert('count is 0', queries.donationItems.count() === 0);

console.log('\n11. count(filter) counts only filtered items');
reset();
const box8 = makeBox('Filter count shelf');
addItem(box8, 'hdmi cable', 'donate');
addItem(box8, 'usb cable', 'donate');
addItem(box8, 'old lamp', 'donate');
assert('filtered count is 2', queries.donationItems.count('cable') === 2);

console.log('\n12. count() reflects items not boxes');
reset();
const boxA = makeBox('Box A');
const boxB = makeBox('Box B');
addItem(boxA, 'item 1', 'donate');
addItem(boxA, 'item 2', 'donate');
addItem(boxB, 'item 3', 'donate');
assert('count is 3 not 2 (boxes)', queries.donationItems.count() === 3);

// ── itemsByBox() ──────────────────────────────────────────────────────────────

console.log('\n13. itemsByBox() returns grouped [{box, items[]}] array');
reset();
const boxC = makeBox('Box C');
const boxD = makeBox('Box D');
addItem(boxC, 'lamp', 'donate');
addItem(boxC, 'rug', 'donate');
addItem(boxD, 'chair', 'donate');
const grouped = queries.donationItems.itemsByBox();
assert('two groups returned', grouped.length === 2);
assert('first group has box', grouped[0].box !== undefined);
assert('first group has items array', Array.isArray(grouped[0].items));
assert('box C has 2 items', grouped.find((g) => g.box.id === boxC.id).items.length === 2);
assert('box D has 1 item', grouped.find((g) => g.box.id === boxD.id).items.length === 1);

console.log('\n14. itemsByBox() excludes boxes with no matching items');
reset();
const boxE = makeBox('Has donate');
const boxF = makeBox('No donate');
addItem(boxE, 'lamp', 'donate');
addItem(boxF, 'chair', 'keep');
assert('only one group returned', queries.donationItems.itemsByBox().length === 1);
assert('group is box E', queries.donationItems.itemsByBox()[0].box.id === boxE.id);

console.log('\n15. itemsByBox(filter) applies filter before grouping');
reset();
const boxG = makeBox('Box G');
addItem(boxG, 'hdmi cable', 'donate');
addItem(boxG, 'usb cable', 'donate');
addItem(boxG, 'old lamp', 'donate');
const filteredGrouped = queries.donationItems.itemsByBox('cable');
assert('one group returned', filteredGrouped.length === 1);
assert('group has 2 items (cables only)', filteredGrouped[0].items.length === 2);

console.log('\n16. itemsByBox() returns empty array with no matching items');
reset();
makeBox('Empty box');
assert('empty array', queries.donationItems.itemsByBox().length === 0);

// ── PREDICATE INDEPENDENCE ────────────────────────────────────────────────────

console.log('\n17. Different named queries use their own predicates independently');
reset();
const box9 = makeBox('Multi fate shelf');
addItem(box9, 'donate item', 'donate');
addItem(box9, 'sell item', 'sell');
addItem(box9, 'keep item', 'keep');
assert('donationItems sees 1 item', queries.donationItems.count() === 1);
assert('sellItems sees 1 item', queries.sellItems.count() === 1);
assert('ewasteItems sees 0 items', queries.ewasteItems.count() === 0);

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
