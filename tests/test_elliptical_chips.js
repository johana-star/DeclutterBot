// test_elliptical_chips.js — Tests for elliptical action chips in box review
// Run with: node tests/test_elliptical_chips.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastChips = [];
var lastBotMessage = '';
var localStorageData = {};

global.addBotMessage    = function(text) { lastBotMessage = text; };
global.addUserMessage   = function() {};
global.setChips         = function(chips) { lastChips = chips; };
global.renderSidebar    = function() {};
global.updateContextBar = function() {};
global.saveState        = function() {};
global.localStorage     = {
  getItem:    function(k) { return localStorageData[k] || null; },
  setItem:    function(k, v) { localStorageData[k] = v; },
  removeItem: function(k) { delete localStorageData[k]; }
};
global.document = {
  getElementById: function() { return { innerHTML: '', value: '', style: {}, scrollTop: 0, textContent: '', appendChild: function(){}, classList: { add: function(){}, remove: function(){} } }; },
  createElement:  function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){}, style: {}, scrollTop: 0 }; },
  querySelector:  function() { return null; },
  addEventListener: function() {}
};

var app         = require('../app.js');
var state       = app.state;
var uid         = app.uid;
var processInput = app.processInput;
var reviewBox   = app.reviewBox;

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.conversationStage = 'BOX_OPEN';
  lastChips = [];
  lastBotMessage = '';
}

function makeBox(name, location) {
  var box = { id: uid(), name: name, location: location, notes: '', parentId: null, createdAt: '', items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}

function makeItem(box, name, fate) {
  var item = { id: uid(), name: name, fate: fate, description: '', notes: '', createdAt: '' };
  box.items.push(item);
  return item;
}

console.log('\nElliptical Chip Tests\n');

// ── 1-2 eligible → numbered chips ────────────────────────────────────────────
console.log('1. One trashable + one deletable shows numbered chips');
reset();
var box = makeBox('Box', 'room');
makeItem(box, 'Lamp', 'keep');           // item 1 — trashable
makeItem(box, 'Broken chair', 'trash');  // item 2 — deletable
reviewBox();
assert('Trash 1 chip shown', lastChips.indexOf('Trash 1') !== -1);
assert('Delete 2 chip shown', lastChips.indexOf('Delete 2') !== -1);
assert('no Trash... chip', lastChips.indexOf('Trash...') === -1);

// ── Trash... chip absent when all items are already trash-fated ───────────────
console.log('\n2. All-trash box with 2 items shows numbered Delete chips');
reset();
var box2 = makeBox('Box', 'room');
makeItem(box2, 'Broken lamp', 'trash');  // item 1
makeItem(box2, 'Broken rug', 'trash');   // item 2
reviewBox();
assert('Trash... chip absent', lastChips.indexOf('Trash...') === -1);
assert('Delete 1 chip shown', lastChips.indexOf('Delete 1') !== -1);
assert('Delete 2 chip shown', lastChips.indexOf('Delete 2') !== -1);
assert('no Delete... chip', lastChips.indexOf('Delete...') === -1);

// ── Trash... intercept ────────────────────────────────────────────────────────
console.log('\n3. Trash... shows reminder message listing trashable item numbers');
reset();
var box3 = makeBox('Box', 'room');
makeItem(box3, 'Lamp', 'keep');      // item 1 — trashable
makeItem(box3, 'Broken chair', 'trash'); // item 2 — already trash, not listed
makeItem(box3, 'Rug', 'donate');     // item 3 — trashable
state.conversationStage = 'BOX_OPEN';
processInput('Trash...', []);
assert('reminder message sent', lastBotMessage.indexOf('1') !== -1 && lastBotMessage.indexOf('3') !== -1);
assert('item 2 not in reminder', lastBotMessage.indexOf('2') === -1);
assert('stage unchanged', state.conversationStage === 'BOX_OPEN');


// ── Delete... intercept ───────────────────────────────────────────────────────
console.log('\n4. Delete... shows reminder listing only already-trash-fated item numbers');
reset();
var box4 = makeBox('Box', 'room');
makeItem(box4, 'Lamp', 'keep');         // item 1 — not deletable
makeItem(box4, 'Broken chair', 'trash'); // item 2 — deletable
makeItem(box4, 'Rug', 'donate');        // item 3 — not deletable
makeItem(box4, 'Old tv', 'trash');      // item 4 — deletable
state.conversationStage = 'BOX_OPEN';
processInput('Delete...', []);
assert('reminder includes item 2', lastBotMessage.indexOf('2') !== -1);
assert('reminder includes item 4', lastBotMessage.indexOf('4') !== -1);
assert('reminder excludes item 1', lastBotMessage.indexOf('1') === -1);
assert('stage unchanged', state.conversationStage === 'BOX_OPEN');


// ── Threshold: 1-2 eligible → numbered chips, 3+ → elliptical ────────────────
console.log('\n5. One trashable item shows Trash N chip not Trash...');
reset();
var box5 = makeBox('Box', 'room');
makeItem(box5, 'Lamp', 'keep');    // item 1 — trashable
makeItem(box5, 'Broken chair', 'trash'); // item 2 — already trash
reviewBox();
assert('Trash 1 chip shown', lastChips.indexOf('Trash 1') !== -1);
assert('no Trash... chip', lastChips.indexOf('Trash...') === -1);

console.log('\n6. Two trashable items show Trash N chips not Trash...');
reset();
var box6 = makeBox('Box', 'room');
makeItem(box6, 'Lamp', 'keep');    // item 1 — trashable
makeItem(box6, 'Rug', 'donate');   // item 2 — trashable
makeItem(box6, 'Broken chair', 'trash'); // item 3 — already trash
reviewBox();
assert('Trash 1 chip shown', lastChips.indexOf('Trash 1') !== -1);
assert('Trash 2 chip shown', lastChips.indexOf('Trash 2') !== -1);
assert('no Trash... chip', lastChips.indexOf('Trash...') === -1);

console.log('\n7. Three trashable items show Trash... not numbered chips');
reset();
var box7 = makeBox('Box', 'room');
makeItem(box7, 'Lamp', 'keep');    // item 1 — trashable
makeItem(box7, 'Rug', 'donate');   // item 2 — trashable
makeItem(box7, 'Chair', 'unsure'); // item 3 — trashable
reviewBox();
assert('Trash... chip shown', lastChips.indexOf('Trash...') !== -1);
assert('no numbered Trash chips', !lastChips.some(c => /^Trash \d+$/.test(c)));

console.log('\n8. Two deletable items show Delete N chips not Delete...');
reset();
var box8 = makeBox('Box', 'room');
makeItem(box8, 'Lamp', 'keep');
makeItem(box8, 'Broken chair', 'trash'); // item 2 — deletable
makeItem(box8, 'Old tv', 'trash');       // item 3 — deletable
reviewBox();
assert('Delete 2 chip shown', lastChips.indexOf('Delete 2') !== -1);
assert('Delete 3 chip shown', lastChips.indexOf('Delete 3') !== -1);
assert('no Delete... chip', lastChips.indexOf('Delete...') === -1);

console.log('\n9. Three deletable items show Delete... not numbered chips');
reset();
var box9 = makeBox('Box', 'room');
makeItem(box9, 'Lamp', 'keep');
makeItem(box9, 'Broken chair', 'trash'); // item 2
makeItem(box9, 'Old tv', 'trash');       // item 3
makeItem(box9, 'Busted lamp', 'trash');  // item 4
reviewBox();
assert('Delete... chip shown', lastChips.indexOf('Delete...') !== -1);
assert('no numbered Delete chips', !lastChips.some(c => /^Delete \d+$/.test(c)));


// ── Keep chip ─────────────────────────────────────────────────────────────────
console.log('\n10. One non-keep item shows Keep 1 chip');
reset();
var box10 = makeBox('Box', 'room');
makeItem(box10, 'Lamp', 'unsure');  // item 1 — can be kept
reviewBox();
assert('Keep 1 chip shown', lastChips.indexOf('Keep 1') !== -1);
assert('no Keep... chip', lastChips.indexOf('Keep...') === -1);

console.log('\n11. Three non-keep items show Keep... chip');
reset();
var box11 = makeBox('Box', 'room');
makeItem(box11, 'Lamp', 'unsure');   // item 1
makeItem(box11, 'Rug', 'donate');    // item 2
makeItem(box11, 'Chair', 'trash');   // item 3
reviewBox();
assert('Keep... chip shown', lastChips.indexOf('Keep...') !== -1);
assert('no numbered Keep chips', !lastChips.some(c => /^Keep \d+$/.test(c)));

console.log('\n12. Keep... intercept sends reminder with eligible item numbers');
reset();
var box12 = makeBox('Box', 'room');
makeItem(box12, 'Lamp', 'unsure');   // item 1
makeItem(box12, 'Rug', 'donate');    // item 2
makeItem(box12, 'Chair', 'keep');    // item 3 — already keep, not listed
makeItem(box12, 'Table', 'trash');   // item 4
state.conversationStage = 'BOX_OPEN';
processInput('Keep...', []);
assert('reminder includes item 1', lastBotMessage.indexOf('1') !== -1);
assert('reminder includes item 2', lastBotMessage.indexOf('2') !== -1);
assert('reminder includes item 4', lastBotMessage.indexOf('4') !== -1);
assert('reminder excludes item 3', lastBotMessage.indexOf('3') === -1);


// ── Donate chip ───────────────────────────────────────────────────────────────
console.log('\n13. Two non-donate items show Donate N chips');
reset();
var box13 = makeBox('Box', 'room');
makeItem(box13, 'Lamp', 'keep');    // item 1
makeItem(box13, 'Rug', 'donate');   // item 2 — already donate, excluded
makeItem(box13, 'Chair', 'unsure'); // item 3
reviewBox();
assert('Donate 1 chip shown', lastChips.indexOf('Donate 1') !== -1);
assert('Donate 3 chip shown', lastChips.indexOf('Donate 3') !== -1);
assert('no Donate... chip', lastChips.indexOf('Donate...') === -1);

console.log('\n14. Three non-donate items show Donate... chip');
reset();
var box14 = makeBox('Box', 'room');
makeItem(box14, 'Lamp', 'keep');
makeItem(box14, 'Chair', 'unsure');
makeItem(box14, 'Table', 'trash');
reviewBox();
assert('Donate... chip shown', lastChips.indexOf('Donate...') !== -1);
assert('no numbered Donate chips', !lastChips.some(c => /^Donate \d+$/.test(c)));

console.log('\n15. Donate... intercept sends reminder with eligible item numbers');
reset();
var box15 = makeBox('Box', 'room');
makeItem(box15, 'Lamp', 'keep');    // item 1 — eligible
makeItem(box15, 'Rug', 'donate');   // item 2 — already donate, excluded
makeItem(box15, 'Chair', 'unsure'); // item 3 — eligible
makeItem(box15, 'Table', 'trash');  // item 4 — eligible
state.conversationStage = 'BOX_OPEN';
processInput('Donate...', []);
assert('reminder includes item 1', lastBotMessage.indexOf('1') !== -1);
assert('reminder includes item 3', lastBotMessage.indexOf('3') !== -1);
assert('reminder includes item 4', lastBotMessage.indexOf('4') !== -1);
assert('reminder excludes item 2', lastBotMessage.indexOf('2') === -1);

// ── Sell chip ─────────────────────────────────────────────────────────────────
console.log('\n16. Two non-sell items show Sell N chips');
reset();
var box16 = makeBox('Box', 'room');
makeItem(box16, 'Lamp', 'keep');   // item 1
makeItem(box16, 'Rug', 'sell');    // item 2 — already sell, excluded
makeItem(box16, 'Chair', 'unsure'); // item 3
reviewBox();
assert('Sell 1 chip shown', lastChips.indexOf('Sell 1') !== -1);
assert('Sell 3 chip shown', lastChips.indexOf('Sell 3') !== -1);
assert('no Sell... chip', lastChips.indexOf('Sell...') === -1);

console.log('\n17. Three non-sell items show Sell... chip');
reset();
var box17 = makeBox('Box', 'room');
makeItem(box17, 'Lamp', 'keep');
makeItem(box17, 'Chair', 'unsure');
makeItem(box17, 'Table', 'donate');
reviewBox();
assert('Sell... chip shown', lastChips.indexOf('Sell...') !== -1);
assert('no numbered Sell chips', !lastChips.some(c => /^Sell \d+$/.test(c)));

console.log('\n18. Sell... intercept sends reminder');
reset();
var box18 = makeBox('Box', 'room');
makeItem(box18, 'Lamp', 'keep');   // item 1 — eligible
makeItem(box18, 'Rug', 'sell');    // item 2 — already sell, excluded
makeItem(box18, 'Chair', 'unsure'); // item 3 — eligible
makeItem(box18, 'Table', 'trash'); // item 4 — eligible
state.conversationStage = 'BOX_OPEN';
processInput('Sell...', []);
assert('reminder includes item 1', lastBotMessage.indexOf('1') !== -1);
assert('reminder includes item 3', lastBotMessage.indexOf('3') !== -1);
assert('reminder excludes item 2', lastBotMessage.indexOf('2') === -1);

// ── Unsure chip ───────────────────────────────────────────────────────────────
console.log('\n19. Two non-unsure items show Unsure N chips');
reset();
var box19 = makeBox('Box', 'room');
makeItem(box19, 'Lamp', 'keep');    // item 1
makeItem(box19, 'Rug', 'unsure');   // item 2 — already unsure, excluded
makeItem(box19, 'Chair', 'donate'); // item 3
reviewBox();
assert('Unsure 1 chip shown', lastChips.indexOf('Unsure 1') !== -1);
assert('Unsure 3 chip shown', lastChips.indexOf('Unsure 3') !== -1);
assert('no Unsure... chip', lastChips.indexOf('Unsure...') === -1);

console.log('\n20. Three non-unsure items show Unsure... chip');
reset();
var box20 = makeBox('Box', 'room');
makeItem(box20, 'Lamp', 'keep');
makeItem(box20, 'Chair', 'donate');
makeItem(box20, 'Table', 'sell');
reviewBox();
assert('Unsure... chip shown', lastChips.indexOf('Unsure...') !== -1);
assert('no numbered Unsure chips', !lastChips.some(c => /^Unsure \d+$/.test(c)));

console.log('\n21. Unsure... intercept sends reminder');
reset();
var box21 = makeBox('Box', 'room');
makeItem(box21, 'Lamp', 'keep');    // item 1 — eligible
makeItem(box21, 'Rug', 'unsure');   // item 2 — already unsure, excluded
makeItem(box21, 'Chair', 'donate'); // item 3 — eligible
makeItem(box21, 'Table', 'sell');   // item 4 — eligible
state.conversationStage = 'BOX_OPEN';
processInput('Unsure...', []);
assert('reminder includes item 1', lastBotMessage.indexOf('1') !== -1);
assert('reminder includes item 3', lastBotMessage.indexOf('3') !== -1);
assert('reminder excludes item 2', lastBotMessage.indexOf('2') === -1);


// ── Chip order ────────────────────────────────────────────────────────────────
console.log('\n22. Action chips appear in FATES order: Trash, Return, Sell, Keep, Donate, Unsure, Delete');
reset();
var box22 = makeBox('Box', 'room');
makeItem(box22, 'Lamp', 'keep');
makeItem(box22, 'Rug', 'donate');
makeItem(box22, 'Chair', 'sell');
makeItem(box22, 'Table', 'unsure');
makeItem(box22, 'Broken fan', 'trash');
reviewBox();
var trashIdx  = lastChips.findIndex(c => c.startsWith('Trash'));
var sellIdx   = lastChips.findIndex(c => c.startsWith('Sell'));
var keepIdx   = lastChips.findIndex(c => c.startsWith('Keep'));
var donateIdx = lastChips.findIndex(c => c.startsWith('Donate'));
var unsureIdx = lastChips.findIndex(c => c.startsWith('Unsure'));
var deleteIdx = lastChips.findIndex(c => c.startsWith('Delete'));
assert('Trash before Sell', trashIdx < sellIdx);
assert('Sell before Keep', sellIdx < keepIdx);
assert('Keep before Donate', keepIdx < donateIdx);
assert('Donate before Unsure', donateIdx < unsureIdx);
assert('Unsure before Delete', unsureIdx < deleteIdx);


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + '  ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
