// test_ewaste_expedition.js — Tests for E-waste Expedition side quest
// Run with: node tests/test_ewaste_expedition.js

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
const helpers      = app.helpers;
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
    fate: fate || 'unsure',
    notes: notes || '',
    deleted_at: null,
    createdAt: new Date().toISOString()
  };
  box.items.push(item);
  return item;
}

console.log('\nE-waste Expedition Side Quest\n');

// ── helpers.ewasteItems() ─────────────────────────────────────────────────────

console.log('1. ewasteItems returns empty array with no items');
reset();
assert('empty array', helpers.ewasteItems().length === 0);

console.log('\n2. trash items with e-waste keywords in name are returned');
reset();
const box1 = makeBox('Electronics shelf');
addItem(box1, 'old laptop', 'trash');
addItem(box1, 'broken charger', 'trash');
const found = helpers.ewasteItems();
assert('laptop returned', found.some(({ item }) => item.name === 'old laptop'));
assert('charger returned', found.some(({ item }) => item.name === 'broken charger'));

console.log('\n3. unsure items with e-waste keywords are returned');
reset();
const box2 = makeBox('Junk drawer');
addItem(box2, 'mystery cable', 'unsure');
const foundUnsure = helpers.ewasteItems();
assert('unsure cable returned', foundUnsure.some(({ item }) => item.name === 'mystery cable'));

console.log('\n4. items with e-waste keywords in notes are returned');
reset();
const box3 = makeBox('Closet');
addItem(box3, 'old thing', 'trash', 'ewaste, needs special disposal');
const foundNotes = helpers.ewasteItems();
assert('item with ewaste in notes returned', foundNotes.some(({ item }) => item.name === 'old thing'));

console.log('\n5. keep/donate/sell/return items are excluded even with matching keywords');
reset();
const box4 = makeBox('Tech shelf');
addItem(box4, 'working laptop', 'keep');
addItem(box4, 'spare charger', 'donate');
addItem(box4, 'old phone', 'sell');
addItem(box4, 'borrowed cable', 'return');
assert('keep item excluded', helpers.ewasteItems().length === 0);

console.log('\n6. items without e-waste keywords are excluded regardless of fate');
reset();
const box5 = makeBox('Misc');
addItem(box5, 'wooden chair', 'trash');
addItem(box5, 'winter jacket', 'unsure');
assert('non-ewaste items excluded', helpers.ewasteItems().length === 0);

console.log('\n7. soft-deleted items are excluded');
reset();
const box6 = makeBox('Shelf');
const deletedItem = addItem(box6, 'deleted cable', 'trash');
deletedItem.deleted_at = new Date().toISOString();
assert('soft-deleted item excluded', helpers.ewasteItems().length === 0);

console.log('\n8. items from soft-deleted boxes are excluded');
reset();
const deletedBox = makeBox('Gone shelf');
deletedBox.deleted_at = new Date().toISOString();
addItem(deletedBox, 'old phone', 'trash');
assert('item in deleted box excluded', helpers.ewasteItems().length === 0);

console.log('\n9. ewasteItems returns correct box reference');
reset();
const box7 = makeBox('Gadget box', 'bedroom');
addItem(box7, 'old router', 'trash');
const refs = helpers.ewasteItems();
assert('box id matches', refs[0].box.id === box7.id);
assert('box name matches', refs[0].box.name === 'Gadget box');

// ── KEYWORD COVERAGE ─────────────────────────────────────────────────────────

console.log('\n10. keyword coverage — batteries');
reset();
const boxBatt = makeBox('Battery box');
addItem(boxBatt, 'AA batteries', 'trash');
addItem(boxBatt, 'lithium pack', 'unsure');
assert('AA batteries matched', helpers.ewasteItems().length === 2);

console.log('\n11. keyword coverage — devices');
reset();
const boxDev = makeBox('Device box');
addItem(boxDev, 'old phone', 'trash');
addItem(boxDev, 'broken tablet', 'trash');
addItem(boxDev, 'dead camera', 'unsure');
assert('phone, tablet, camera all matched', helpers.ewasteItems().length === 3);

console.log('\n12. keyword coverage — computer components');
reset();
const boxComp = makeBox('Parts bin');
addItem(boxComp, 'old SSD', 'trash');
addItem(boxComp, 'spare RAM stick', 'unsure');
assert('SSD and RAM matched', helpers.ewasteItems().length === 2);

// ── CHIP THRESHOLD ────────────────────────────────────────────────────────────

console.log('\n13. E-waste expedition chip absent in showProgress with fewer than 3 candidates');
reset();
const boxFew = makeBox('Few items');
addItem(boxFew, 'old cable', 'trash');
addItem(boxFew, 'broken charger', 'trash');
processInput('show progress', []);
assertNotIncludes('chip absent with 2 candidates', lastChips, 'E-waste expedition');

console.log('\n14. E-waste expedition chip present in showProgress with 3+ candidates');
reset();
const boxMany = makeBox('E-waste box');
addItem(boxMany, 'old cable', 'trash');
addItem(boxMany, 'broken charger', 'trash');
addItem(boxMany, 'dead phone', 'unsure');
processInput('show progress', []);
assert('chip present with 3 candidates', lastChips.includes('E-waste expedition'));

console.log('\n15. E-waste expedition chip absent with exactly 0 candidates');
reset();
makeBox('Empty box');
processInput('show progress', []);
assertNotIncludes('chip absent with 0 candidates', lastChips, 'E-waste expedition');

// ── handleEwasteExpedition OUTPUT ─────────────────────────────────────────────

console.log('\n16. Command produces output listing item names');
reset();
const outputBox = makeBox('Junk shelf', 'attic');
addItem(outputBox, 'old monitor', 'trash', 'cracked screen');
addItem(outputBox, 'spare keyboard', 'unsure');
addItem(outputBox, 'dead mouse', 'trash');
processInput('e-waste expedition', []);
assertIncludes('contains old monitor', lastBotMessage, 'old monitor');
assertIncludes('contains spare keyboard', lastBotMessage, 'spare keyboard');
assertIncludes('contains dead mouse', lastBotMessage, 'dead mouse');

console.log('\n17. Output includes item notes');
reset();
const notesBox = makeBox('Stuff shelf');
addItem(notesBox, 'old phone', 'trash', 'screen cracked, no charger');
addItem(notesBox, 'mystery cable', 'unsure', 'might be HDMI');
addItem(notesBox, 'dead battery pack', 'trash');
processInput('e-waste expedition', []);
assertIncludes('notes included for phone', lastBotMessage, 'screen cracked, no charger');
assertIncludes('notes included for cable', lastBotMessage, 'might be HDMI');

console.log('\n18. Output groups items under their box name');
reset();
const boxA = makeBox('Kitchen drawer', 'kitchen');
const boxB = makeBox('Garage shelf', 'garage');
addItem(boxA, 'old charger', 'trash');
addItem(boxA, 'dead remote', 'trash');
addItem(boxB, 'broken router', 'unsure');
processInput('e-waste expedition', []);
assertIncludes('box A name shown', lastBotMessage, 'Kitchen drawer');
assertIncludes('box B name shown', lastBotMessage, 'Garage shelf');

console.log('\n19. Back chip always present in expedition output');
reset();
const backBox = makeBox('Some box');
addItem(backBox, 'old cable', 'trash');
addItem(backBox, 'dead phone', 'trash');
addItem(backBox, 'spare charger', 'unsure');
processInput('e-waste expedition', []);
assert('Back chip present', lastChips.includes('Back'));

console.log('\n20. Command works from any stage (global intercept)');
reset();
const stageBox = makeBox('Stage test box');
addItem(stageBox, 'laptop', 'trash');
addItem(stageBox, 'phone', 'trash');
addItem(stageBox, 'tablet', 'unsure');
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = stageBox.id;
processInput('e-waste expedition', []);
assertIncludes('works from BOX_OPEN', lastBotMessage, 'laptop');

console.log('\n21. Zero-candidate command shows friendly fallback');
reset();
makeBox('Empty');
processInput('e-waste expedition', []);
assertIncludes('fallback message shown', lastBotMessage, 'No e-waste candidates');
assert('Back chip still shown', lastChips.includes('Back'));

// ── HELP MENU ─────────────────────────────────────────────────────────────────

console.log('\n22. E-waste expedition absent from help when fewer than 3 candidates');
reset();
const helpBox = makeBox('Help test');
addItem(helpBox, 'cable', 'trash');
addItem(helpBox, 'charger', 'trash');
processInput('?', []);
assertNotIncludes('e-waste absent from help below threshold', lastBotMessage, 'E-waste expedition');

console.log('\n23. E-waste expedition present in help when 3+ candidates');
reset();
const helpBox2 = makeBox('Help test 2');
addItem(helpBox2, 'cable', 'trash');
addItem(helpBox2, 'charger', 'trash');
addItem(helpBox2, 'dead phone', 'unsure');
processInput('?', []);
assertIncludes('e-waste present in help above threshold', lastBotMessage, 'E-waste expedition');


// ── FILTER TAGS ───────────────────────────────────────────────────────────────

console.log('\n24. Filter tags shown when 1+ word appears 2+ times across found items');
reset();
const filterBox = makeBox('Cable shelf');
addItem(filterBox, 'hdmi cable', 'trash', 'amazon basics');
addItem(filterBox, 'usb cable', 'trash', 'short cable');
addItem(filterBox, 'power cable', 'unsure');
processInput('e-waste expedition', []);
assertIncludes('filter tags present', lastBotMessage, 'ewaste-filter-tag');
assertIncludes('"cable" tag shown (appears 3x in names)', lastBotMessage, '>cable<');

console.log('\n25. Filter tags absent when no word appears 2+ times');
reset();
const uniqueBox = makeBox('Unique items');
addItem(uniqueBox, 'old laptop', 'trash', 'dead battery');
addItem(uniqueBox, 'broken tablet', 'trash', 'cracked screen');
addItem(uniqueBox, 'spare router', 'unsure', 'factory reset needed');
processInput('e-waste expedition', []);
assertNotIncludes('no repeated words — no filter tags', lastBotMessage, 'ewaste-filter-tag');

console.log('\n26. filter ewaste <word> command filters displayed items');
reset();
const mixedBox = makeBox('Mixed shelf');
addItem(mixedBox, 'hdmi cable', 'trash');
addItem(mixedBox, 'usb cable', 'trash');
addItem(mixedBox, 'old phone', 'unsure');
addItem(mixedBox, 'phone charger', 'trash');
processInput('filter ewaste cable', []);
assertIncludes('cable items shown', lastBotMessage, 'hdmi cable');
assertIncludes('usb cable shown', lastBotMessage, 'usb cable');
assertNotIncludes('phone not shown when filtering cable', lastBotMessage, 'old phone');

console.log('\n27. Filter header shows count of filtered vs total');
reset();
const countBox = makeBox('Count shelf');
addItem(countBox, 'hdmi cable', 'trash');
addItem(countBox, 'usb cable', 'trash');
addItem(countBox, 'old phone', 'unsure');
addItem(countBox, 'phone charger', 'trash');
processInput('filter ewaste cable', []);
assertIncludes('header shows filtered count', lastBotMessage, '2 of 4');

console.log('\n28. Filter header shows active filter label');
reset();
const labelBox = makeBox('Label shelf');
addItem(labelBox, 'hdmi cable', 'trash');
addItem(labelBox, 'usb cable', 'trash');
addItem(labelBox, 'phone', 'unsure');
addItem(labelBox, 'charger', 'trash');
processInput('filter ewaste cable', []);
assertIncludes('filter label shown in header', lastBotMessage, 'filtered by');
assertIncludes('filter word shown', lastBotMessage, 'cable');

console.log('\n29. Filter tags still shown when filter is active (switching is one click)');
reset();
const switchBox = makeBox('Switch shelf');
addItem(switchBox, 'hdmi cable', 'trash', 'short cable');
addItem(switchBox, 'usb cable', 'trash');
addItem(switchBox, 'old phone', 'unsure', 'phone broken');
addItem(switchBox, 'phone charger', 'trash');
processInput('filter ewaste cable', []);
assertIncludes('filter tags still present when filter active', lastBotMessage, 'ewaste-filter-tag');

console.log('\n30. Unfiltered expedition shows all items with no filter label');
reset();
const allBox = makeBox('All shelf');
addItem(allBox, 'hdmi cable', 'trash');
addItem(allBox, 'usb cable', 'trash');
addItem(allBox, 'old phone', 'unsure');
processInput('e-waste expedition', []);
assertNotIncludes('no filter label when unfiltered', lastBotMessage, 'filtered by');
assertIncludes('all items shown', lastBotMessage, 'old phone');

console.log('\n31. filter ewaste command works as global intercept from BOX_OPEN');
reset();
const interceptBox = makeBox('Intercept shelf');
addItem(interceptBox, 'hdmi cable', 'trash');
addItem(interceptBox, 'usb cable', 'unsure');
addItem(interceptBox, 'old phone', 'trash');
state.conversationStage = 'BOX_OPEN';
state.activeBoxId = interceptBox.id;
processInput('filter ewaste cable', []);
assertIncludes('filter works from BOX_OPEN', lastBotMessage, 'hdmi cable');
assertNotIncludes('phone excluded from filter', lastBotMessage, 'old phone');

console.log('\n32. Back chip present when filter is active');
reset();
const backFilterBox = makeBox('Back filter shelf');
addItem(backFilterBox, 'hdmi cable', 'trash');
addItem(backFilterBox, 'usb cable', 'trash');
addItem(backFilterBox, 'phone', 'unsure');
processInput('filter ewaste cable', []);
assert('Back chip present with active filter', lastChips.includes('Back'));

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
