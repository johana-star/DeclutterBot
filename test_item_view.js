// test_item_view.js — Tests for item detail view
// Run with: node test_item_view.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];

global.addBotMessage = function(text) { lastBotMessage = text; };
global.addUserMessage = function() {};
global.setChips = function(chips) { lastChips = chips; };
global.renderSidebar = function() {};
global.updateContextBar = function() {};
global.showTyping = function() {};
global.hideTyping = function() {};
global.saveState = function() {};
global.chipClick = function() {};
global.escHtml = function(s) { return String(s||''); };
global.renderMarkdown = function(s) { return s; };
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.JSZip = function() {};

var app = require('./app.js');
var state                = app.state;
var uid                  = app.uid;
var processInput         = app.processInput;
var handleItemViewByNumber = app.handleItemViewByNumber;
var handleItemViewAction   = app.handleItemViewAction;
var handleItemViewNotes    = app.handleItemViewNotes;
var showItemDetail         = app.showItemDetail;
var groupItems             = app.groupItems;

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  \u2705 ' + desc); passed++; }
  else           { console.error('  \u274c ' + desc); failed++; }
}
function assertIncludes(desc, haystack, needle) {
  assert(desc, haystack && haystack.indexOf(needle) !== -1);
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
  state.conversationStage = 'BOX_OPEN';
  state.conversationHistory = [];
  lastBotMessage = null;
  lastChips = [];
}
function makeBox(name, location) {
  var box = { id: uid(), name: name, location: location||'', notes: '', parentId: null, createdAt: new Date().toISOString(), items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}
function makeItem(box, name, fate, notes) {
  var item = { id: uid(), name: name, fate: fate||'unsure', description: '', notes: notes||'', photos: [], addedAt: new Date().toISOString() };
  box.items.push(item);
  return item;
}

console.log('\nItem View Tests\n');

// 1. Typing a number in BOX_OPEN shows item detail
console.log('1. Typing item number in BOX_OPEN shows item detail');
reset();
var box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep', 'vintage brass');
makeItem(box, 'Chair', 'donate');
processInput('1', []);
assert('stage set to AWAITING_ITEM_VIEW', state.conversationStage === 'AWAITING_ITEM_VIEW');
assertIncludes('shows item name', lastBotMessage, 'Lamp');
assertIncludes('shows fate', lastBotMessage, 'keep');
assertIncludes('shows notes', lastBotMessage, 'vintage brass');

// 2. Item detail shows photo count
console.log('\n2. Item detail shows photo count when photos attached');
reset();
box = makeBox('Test Box', 'bedroom');
var item = makeItem(box, 'Lamp', 'keep');
item.photos.push({ name: 'lamp.jpg', dataUrl: 'data:image/jpeg;base64,abc' });
handleItemViewByNumber(1);
assertIncludes('shows photo count', lastBotMessage, '1 photo');

// 3. Item detail shows "No photos" when none attached
console.log('\n3. Item detail shows "No photos" when none attached');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Chair', 'donate');
handleItemViewByNumber(1);
assertIncludes('shows no photos', lastBotMessage, 'No photos');

// 4. Item detail chips include Change fate, Edit notes, Remove, Back to list
console.log('\n4. Item detail offers correct action chips');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
handleItemViewByNumber(1);
assert('Change fate chip', lastChips.indexOf('Change fate') !== -1);
assert('Edit notes chip', lastChips.indexOf('Edit notes') !== -1);
assert('Remove chip', lastChips.indexOf('Remove') !== -1);
assert('Back to list chip', lastChips.indexOf('Back to list') !== -1);

// 5. "Back to list" returns to review
console.log('\n5. Back to list returns to reviewBox');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'donate');
handleItemViewByNumber(1);
handleItemViewAction('back to list');
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assertIncludes('shows item list', lastBotMessage, 'Items in');

// 6. "Remove" from item view removes the item
console.log('\n6. Remove from item view removes the item');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'donate');
handleItemViewByNumber(1);
handleItemViewAction('remove');
assert('item removed', box.items.length === 1);
assert('correct item removed', box.items[0].name === 'Chair');

// 7. "Change fate" transitions to AWAITING_FATE
console.log('\n7. Change fate transitions to fate selection');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
handleItemViewByNumber(1);
handleItemViewAction('change fate');
assert('stage set to AWAITING_FATE', state.conversationStage === 'AWAITING_FATE');
assertIncludes('asks for fate', lastBotMessage, 'What should we do');
assert('activeItemId set', state.activeItemId !== null);

// 8. "Edit notes" prompts for new notes
console.log('\n8. Edit notes prompts for input');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep', 'old notes');
handleItemViewByNumber(1);
handleItemViewAction('edit notes');
assert('stage set to AWAITING_ITEM_VIEW_NOTES', state.conversationStage === 'AWAITING_ITEM_VIEW_NOTES');
assertIncludes('shows current notes', lastBotMessage, 'old notes');

// 9. Editing notes updates all items in the group
console.log('\n9. Editing notes updates all items in group');
reset();
box = makeBox('Test Box', 'bedroom');
var now = new Date().toISOString();
box.items.push({ id: uid(), name: 'Roll', fate: 'keep', notes: '', photos: [], addedAt: now });
box.items.push({ id: uid(), name: 'Roll', fate: 'keep', notes: '', photos: [], addedAt: now });
handleItemViewByNumber(1);
handleItemViewAction('edit notes');
handleItemViewNotes('fragile, handle with care');
assert('both items updated', box.items.every(function(i){ return i.notes === 'fragile, handle with care'; }));

// 10. "Clear notes" removes notes from all items in group
console.log('\n10. Clear notes removes notes');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep', 'some notes');
handleItemViewByNumber(1);
handleItemViewAction('edit notes');
handleItemViewNotes('clear notes');
assert('notes cleared', box.items[0].notes === '');

// 11. Out-of-range number falls through to item name
console.log('\n11. Out-of-range number treated as item name not item view');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
processInput('5', []); // only 1 item, group 1
assert('treated as new item name', state.conversationStage === 'AWAITING_FATE');
assertIncludes('logged as item', lastBotMessage, '5');

// 12. Batch group item view shows count
console.log('\n12. Batch group shows count in detail view');
reset();
box = makeBox('Test Box', 'bedroom');
var now2 = new Date().toISOString();
for (var i = 0; i < 5; i++) {
  box.items.push({ id: uid(), name: 'Paper towel roll', fate: 'keep', notes: '', photos: [], addedAt: now2 });
}
handleItemViewByNumber(1);
assertIncludes('shows batch count', lastBotMessage, '5 \u00d7');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
