// test_sell_quest.js — Tests for Sell Quest side quest
// Run with: node tests/test_sell_quest.js

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
    fate: fate || 'sell',
    notes: notes || '',
    deleted_at: null,
    createdAt: new Date().toISOString()
  };
  box.items.push(item);
  return item;
}

console.log('\nSell Quest Side Quest\n');

// ── queries.sellItems ────────────────────────────────────────────────────────────

console.log('1. sellItems returns empty array with no items');
reset();
assert('empty array', queries.sellItems.count() === 0);

console.log('\n2. sell items are returned');
reset();
const box1 = makeBox('Electronics shelf');
addItem(box1, 'old camera', 'sell');
addItem(box1, 'spare lens', 'sell');
const found = queries.sellItems.items();
assert('camera returned', found.some(({ item }) => item.name === 'old camera'));
assert('lens returned', found.some(({ item }) => item.name === 'spare lens'));

console.log('\n3. non-sell items are excluded');
reset();
const box2 = makeBox('Misc shelf');
addItem(box2, 'keep item', 'keep');
addItem(box2, 'trash item', 'trash');
addItem(box2, 'donate item', 'donate');
addItem(box2, 'unsure item', 'unsure');
addItem(box2, 'return item', 'return');
assert('no non-sell items returned', queries.sellItems.count() === 0);

console.log('\n4. soft-deleted items are excluded');
reset();
const box3 = makeBox('Deleted shelf');
const deletedItem = addItem(box3, 'deleted sell item', 'sell');
deletedItem.deleted_at = new Date().toISOString();
assert('soft-deleted item excluded', queries.sellItems.count() === 0);

console.log('\n5. items in soft-deleted boxes are excluded');
reset();
const deletedBox = makeBox('Gone box');
deletedBox.deleted_at = new Date().toISOString();
addItem(deletedBox, 'sell item in deleted box', 'sell');
assert('item in deleted box excluded', queries.sellItems.count() === 0);

console.log('\n6. sellItems returns correct box reference');
reset();
const box4 = makeBox('Attic shelf', 'attic');
addItem(box4, 'vintage lamp', 'sell');
const refs = queries.sellItems.items();
assert('box id matches', refs[0].box.id === box4.id);
assert('box name matches', refs[0].box.name === 'Attic shelf');

// ── CHIP THRESHOLD ────────────────────────────────────────────────────────────

console.log('\n7. Sell quest chip absent in showProgress with fewer than 5 items');
reset();
const fewBox = makeBox('Few items');
addItem(fewBox, 'item 1', 'sell');
addItem(fewBox, 'item 2', 'sell');
addItem(fewBox, 'item 3', 'sell');
addItem(fewBox, 'item 4', 'sell');
processInput('show progress', []);
assert('chip absent with 4 sell items', !lastChips.includes('Sell quest'));

console.log('\n8. Sell quest chip present in showProgress with 5+ items');
reset();
const manyBox = makeBox('Many items');
addItem(manyBox, 'item 1', 'sell');
addItem(manyBox, 'item 2', 'sell');
addItem(manyBox, 'item 3', 'sell');
addItem(manyBox, 'item 4', 'sell');
addItem(manyBox, 'item 5', 'sell');
processInput('show progress', []);
assert('chip present with 5 sell items', lastChips.includes('Sell quest'));

console.log('\n9. Sell quest chip absent with 0 sell items');
reset();
makeBox('Empty box');
processInput('show progress', []);
assert('chip absent with 0 items', !lastChips.includes('Sell quest'));

// ── OUTPUT ────────────────────────────────────────────────────────────────────

console.log('\n10. Command produces output listing item names');
reset();
const outputBox = makeBox('Attic shelf', 'attic');
addItem(outputBox, 'vintage camera', 'sell', 'works perfectly');
addItem(outputBox, 'old turntable', 'sell');
addItem(outputBox, 'spare monitor', 'sell', '1080p, minor scratch');
addItem(outputBox, 'keyboard', 'sell');
addItem(outputBox, 'desk lamp', 'sell');
processInput('sell quest', []);
assertIncludes('vintage camera shown', lastBotMessage, 'vintage camera');
assertIncludes('old turntable shown', lastBotMessage, 'old turntable');
assertIncludes('spare monitor shown', lastBotMessage, 'spare monitor');

console.log('\n11. Output includes item notes');
reset();
const notesBox = makeBox('Notes shelf');
addItem(notesBox, 'vintage camera', 'sell', 'works perfectly');
addItem(notesBox, 'spare monitor', 'sell', '1080p, minor scratch');
addItem(notesBox, 'keyboard', 'sell', 'mechanical, cherry mx');
addItem(notesBox, 'desk lamp', 'sell');
addItem(notesBox, 'old book', 'sell', 'first edition');
processInput('sell quest', []);
assertIncludes('notes shown for camera', lastBotMessage, 'works perfectly');
assertIncludes('notes shown for monitor', lastBotMessage, '1080p, minor scratch');

console.log('\n12. Output groups items under their box name');
reset();
const boxA = makeBox('Attic shelf', 'attic');
const boxB = makeBox('Garage shelf', 'garage');
addItem(boxA, 'vintage camera', 'sell');
addItem(boxA, 'old turntable', 'sell');
addItem(boxB, 'spare monitor', 'sell');
addItem(boxB, 'keyboard', 'sell');
addItem(boxB, 'desk lamp', 'sell');
processInput('sell quest', []);
assertIncludes('box A name shown', lastBotMessage, 'Attic shelf');
assertIncludes('box B name shown', lastBotMessage, 'Garage shelf');

console.log('\n13. Back chip always present');
reset();
const backBox = makeBox('Back test');
addItem(backBox, 'item 1', 'sell');
addItem(backBox, 'item 2', 'sell');
addItem(backBox, 'item 3', 'sell');
addItem(backBox, 'item 4', 'sell');
addItem(backBox, 'item 5', 'sell');
processInput('sell quest', []);
assert('Back chip present', lastChips.includes('Back'));

console.log('\n14. Command works from any stage (global intercept)');
reset();
const stageBox = makeBox('Stage test');
addItem(stageBox, 'item 1', 'sell');
addItem(stageBox, 'item 2', 'sell');
addItem(stageBox, 'item 3', 'sell');
addItem(stageBox, 'item 4', 'sell');
addItem(stageBox, 'item 5', 'sell');
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = stageBox.id;
processInput('sell quest', []);
assertIncludes('works from BOX_OPEN', lastBotMessage, 'item 1');

console.log('\n15. Zero-item command shows friendly fallback');
reset();
makeBox('Empty');
processInput('sell quest', []);
assertIncludes('fallback message shown', lastBotMessage, 'No sell candidates');
assert('Back chip shown on fallback', lastChips.includes('Back'));

console.log('\n16. Header shows correct item count and label');
reset();
const countBox = makeBox('Count shelf');
addItem(countBox, 'item 1', 'sell');
addItem(countBox, 'item 2', 'sell');
addItem(countBox, 'item 3', 'sell');
addItem(countBox, 'item 4', 'sell');
addItem(countBox, 'item 5', 'sell');
addItem(countBox, 'item 6', 'sell');
processInput('sell quest', []);
assertIncludes('count shown in header', lastBotMessage, '6');
assertIncludes('ready to sell in header', lastBotMessage, 'ready to sell');

// ── HELP MENU ─────────────────────────────────────────────────────────────────

console.log('\n17. Sell quest absent from help below threshold');
reset();
const helpBox = makeBox('Help test');
addItem(helpBox, 'item 1', 'sell');
addItem(helpBox, 'item 2', 'sell');
processInput('?', []);
assertNotIncludes('sell quest absent below threshold', lastBotMessage, 'Sell quest');

console.log('\n18. Sell quest present in help at threshold');
reset();
const helpBox2 = makeBox('Help test 2');
addItem(helpBox2, 'item 1', 'sell');
addItem(helpBox2, 'item 2', 'sell');
addItem(helpBox2, 'item 3', 'sell');
addItem(helpBox2, 'item 4', 'sell');
addItem(helpBox2, 'item 5', 'sell');
processInput('?', []);
assertIncludes('sell quest present at threshold', lastBotMessage, 'Sell quest');

// ── COEXISTENCE WITH OTHER QUESTS ─────────────────────────────────────────────

console.log('\n19. All three quest chips shown when all thresholds met');
reset();
const allBox = makeBox('All quests box');
addItem(allBox, 'sell 1', 'sell');
addItem(allBox, 'sell 2', 'sell');
addItem(allBox, 'sell 3', 'sell');
addItem(allBox, 'sell 4', 'sell');
addItem(allBox, 'sell 5', 'sell');
addItem(allBox, 'donate 1', 'donate');
addItem(allBox, 'donate 2', 'donate');
addItem(allBox, 'donate 3', 'donate');
addItem(allBox, 'donate 4', 'donate');
addItem(allBox, 'donate 5', 'donate');
addItem(allBox, 'old cable', 'trash');
addItem(allBox, 'dead phone', 'trash');
addItem(allBox, 'broken charger', 'unsure');
processInput('show progress', []);
assert('Sell quest chip present', lastChips.includes('Sell quest'));
assert('Donation run chip present', lastChips.includes('Donation run'));
assert('E-waste expedition chip present', lastChips.includes('E-waste expedition'));

console.log('\n20. Only sell chip shown when only sell threshold met');
reset();
const sellOnlyBox = makeBox('Sell only');
addItem(sellOnlyBox, 'item 1', 'sell');
addItem(sellOnlyBox, 'item 2', 'sell');
addItem(sellOnlyBox, 'item 3', 'sell');
addItem(sellOnlyBox, 'item 4', 'sell');
addItem(sellOnlyBox, 'item 5', 'sell');
processInput('show progress', []);
assert('Sell quest chip present', lastChips.includes('Sell quest'));
assert('Donation run chip absent', !lastChips.includes('Donation run'));
assert('E-waste chip absent', !lastChips.includes('E-waste expedition'));

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
