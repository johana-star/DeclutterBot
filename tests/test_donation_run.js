// test_donation_run.js — Tests for Donation Run side quest
// Run with: node tests/test_donation_run.js

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

const app          = require('../app.js');
const state        = app.state;
const queries      = app.queries;
const processInput = app.processInput;

// ── HARNESS ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}
function assertIncludes(desc, haystack, needle) {
  assert(desc, haystack != null && haystack.includes(needle));
}
function assertNotIncludes(desc, haystack, needle) {
  assert(desc, haystack == null || !haystack.includes(needle));
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.pendingBatch = null;
  state.pendingBoxBatch = null;
  state.pendingDeleteBoxId = null;
  state.pendingNest = null;
  state.activeItemViewGroup = null;
  state.pendingFateReview = null;
  state.conversationStage = 'FINISHED';
  state.mainQuest = {
    uncatalogedBoxes: [],
    completionEstimate: null,
    completedLocations: [],
    calibratedAt: null
  };
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
    fate: fate || 'donate',
    notes: notes || '',
    deleted_at: null,
    createdAt: new Date().toISOString()
  };
  box.items.push(item);
  return item;
}

console.log('\nDonation Run Side Quest\n');

// ── queries.donationItems ────────────────────────────────────────────────────────

console.log('1. donationItems returns empty array with no items');
reset();
assert('empty array', queries.donationItems.count() === 0);

console.log('\n2. donate items are returned');
reset();
const box1 = makeBox('Living room shelf');
addItem(box1, 'old lamp', 'donate');
addItem(box1, 'spare blanket', 'donate');
const found = queries.donationItems.items();
assert('lamp returned', found.some(({ item }) => item.name === 'old lamp'));
assert('blanket returned', found.some(({ item }) => item.name === 'spare blanket'));

console.log('\n3. non-donate items are excluded');
reset();
const box2 = makeBox('Misc shelf');
addItem(box2, 'keep item', 'keep');
addItem(box2, 'trash item', 'trash');
addItem(box2, 'sell item', 'sell');
addItem(box2, 'unsure item', 'unsure');
addItem(box2, 'return item', 'return');
assert('no non-donate items returned', queries.donationItems.count() === 0);

console.log('\n4. soft-deleted items are excluded');
reset();
const box3 = makeBox('Deleted shelf');
const deletedItem = addItem(box3, 'deleted donation', 'donate');
deletedItem.deleted_at = new Date().toISOString();
assert('soft-deleted item excluded', queries.donationItems.count() === 0);

console.log('\n5. items in soft-deleted boxes are excluded');
reset();
const deletedBox = makeBox('Gone box');
deletedBox.deleted_at = new Date().toISOString();
addItem(deletedBox, 'donation in deleted box', 'donate');
assert('item in deleted box excluded', queries.donationItems.count() === 0);

console.log('\n6. donationItems returns correct box reference');
reset();
const box4 = makeBox('Bedroom shelf', 'bedroom');
addItem(box4, 'old lamp', 'donate');
const refs = queries.donationItems.items();
assert('box id matches', refs[0].box.id === box4.id);
assert('box name matches', refs[0].box.name === 'Bedroom shelf');

// ── CHIP THRESHOLD ────────────────────────────────────────────────────────────

console.log('\n7. Donation run chip absent in showProgress with fewer than 5 items');
reset();
const fewBox = makeBox('Few items');
addItem(fewBox, 'item 1', 'donate');
addItem(fewBox, 'item 2', 'donate');
addItem(fewBox, 'item 3', 'donate');
addItem(fewBox, 'item 4', 'donate');
processInput('show progress', []);
assert('chip absent with 4 donate items', !lastChips.includes('Donation run'));

console.log('\n8. Donation run chip present in showProgress with 5+ items');
reset();
const manyBox = makeBox('Many items');
addItem(manyBox, 'item 1', 'donate');
addItem(manyBox, 'item 2', 'donate');
addItem(manyBox, 'item 3', 'donate');
addItem(manyBox, 'item 4', 'donate');
addItem(manyBox, 'item 5', 'donate');
processInput('show progress', []);
assert('chip present with 5 donate items', lastChips.includes('Donation run'));

console.log('\n9. Donation run chip absent with 0 donate items');
reset();
makeBox('Empty box');
processInput('show progress', []);
assert('chip absent with 0 items', !lastChips.includes('Donation run'));

// ── OUTPUT ────────────────────────────────────────────────────────────────────

console.log('\n10. Command produces output listing item names');
reset();
const outputBox = makeBox('Closet shelf', 'bedroom');
addItem(outputBox, 'winter coat', 'donate', 'barely worn');
addItem(outputBox, 'spare towels', 'donate');
addItem(outputBox, 'old books', 'donate', 'mixed fiction');
addItem(outputBox, 'kitchen gadgets', 'donate');
addItem(outputBox, 'board games', 'donate');
processInput('donation run', []);
assertIncludes('winter coat shown', lastBotMessage, 'winter coat');
assertIncludes('spare towels shown', lastBotMessage, 'spare towels');
assertIncludes('old books shown', lastBotMessage, 'old books');

console.log('\n11. Output includes item notes');
reset();
const notesBox = makeBox('Notes shelf');
addItem(notesBox, 'winter coat', 'donate', 'barely worn, size M');
addItem(notesBox, 'old books', 'donate', 'mixed fiction');
addItem(notesBox, 'kitchen gadgets', 'donate', 'never used');
addItem(notesBox, 'board games', 'donate');
addItem(notesBox, 'spare lamp', 'donate', 'works fine');
processInput('donation run', []);
assertIncludes('notes shown for coat', lastBotMessage, 'barely worn, size M');
assertIncludes('notes shown for books', lastBotMessage, 'mixed fiction');

console.log('\n12. Output groups items under their box name');
reset();
const boxA = makeBox('Bedroom closet', 'bedroom');
const boxB = makeBox('Living room shelf', 'living room');
addItem(boxA, 'old coat', 'donate');
addItem(boxA, 'spare shoes', 'donate');
addItem(boxB, 'old lamp', 'donate');
addItem(boxB, 'picture frame', 'donate');
addItem(boxB, 'vase', 'donate');
processInput('donation run', []);
assertIncludes('box A name shown', lastBotMessage, 'Bedroom closet');
assertIncludes('box B name shown', lastBotMessage, 'Living room shelf');

console.log('\n13. Back chip always present');
reset();
const backBox = makeBox('Back test');
addItem(backBox, 'item 1', 'donate');
addItem(backBox, 'item 2', 'donate');
addItem(backBox, 'item 3', 'donate');
addItem(backBox, 'item 4', 'donate');
addItem(backBox, 'item 5', 'donate');
processInput('donation run', []);
assert('Back chip present', lastChips.includes('Back'));

console.log('\n14. Command works from any stage (global intercept)');
reset();
const stageBox = makeBox('Stage test');
addItem(stageBox, 'item 1', 'donate');
addItem(stageBox, 'item 2', 'donate');
addItem(stageBox, 'item 3', 'donate');
addItem(stageBox, 'item 4', 'donate');
addItem(stageBox, 'item 5', 'donate');
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = stageBox.id;
processInput('donation run', []);
assertIncludes('works from BOX_OPEN', lastBotMessage, 'item 1');

console.log('\n15. Zero-item command shows friendly fallback');
reset();
makeBox('Empty');
processInput('donation run', []);
assertIncludes('fallback message shown', lastBotMessage, 'No donation candidates');
assert('Back chip shown on fallback', lastChips.includes('Back'));

console.log('\n16. Header shows correct item count');
reset();
const countBox = makeBox('Count shelf');
addItem(countBox, 'item 1', 'donate');
addItem(countBox, 'item 2', 'donate');
addItem(countBox, 'item 3', 'donate');
addItem(countBox, 'item 4', 'donate');
addItem(countBox, 'item 5', 'donate');
addItem(countBox, 'item 6', 'donate');
processInput('donation run', []);
assertIncludes('count shown in header', lastBotMessage, '6');
assertIncludes('ready to go in header', lastBotMessage, 'ready to go');

// ── HELP MENU ─────────────────────────────────────────────────────────────────

console.log('\n17. Donation run absent from help below threshold');
reset();
const helpBox = makeBox('Help test');
addItem(helpBox, 'item 1', 'donate');
addItem(helpBox, 'item 2', 'donate');
processInput('?', []);
assertNotIncludes('donation run absent below threshold', lastBotMessage, 'Donation run');

console.log('\n18. Donation run present in help at threshold');
reset();
const helpBox2 = makeBox('Help test 2');
addItem(helpBox2, 'item 1', 'donate');
addItem(helpBox2, 'item 2', 'donate');
addItem(helpBox2, 'item 3', 'donate');
addItem(helpBox2, 'item 4', 'donate');
addItem(helpBox2, 'item 5', 'donate');
processInput('?', []);
assertIncludes('donation run present at threshold', lastBotMessage, 'Donation run');

// ── COEXISTENCE WITH E-WASTE ──────────────────────────────────────────────────

console.log('\n19. Both quest chips shown when both thresholds met');
reset();
const bothBox = makeBox('Both quests box');
addItem(bothBox, 'item 1', 'donate');
addItem(bothBox, 'item 2', 'donate');
addItem(bothBox, 'item 3', 'donate');
addItem(bothBox, 'item 4', 'donate');
addItem(bothBox, 'item 5', 'donate');
addItem(bothBox, 'old cable', 'trash');
addItem(bothBox, 'dead phone', 'trash');
addItem(bothBox, 'broken charger', 'unsure');
processInput('show progress', []);
assert('Donation run chip present', lastChips.includes('Donation run'));
assert('E-waste expedition chip present', lastChips.includes('E-waste expedition'));

console.log('\n20. Only donation chip shown when only donation threshold met');
reset();
const donateOnlyBox = makeBox('Donate only');
addItem(donateOnlyBox, 'item 1', 'donate');
addItem(donateOnlyBox, 'item 2', 'donate');
addItem(donateOnlyBox, 'item 3', 'donate');
addItem(donateOnlyBox, 'item 4', 'donate');
addItem(donateOnlyBox, 'item 5', 'donate');
processInput('show progress', []);
assert('Donation run chip present', lastChips.includes('Donation run'));
assert('E-waste chip absent', !lastChips.includes('E-waste expedition'));

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
