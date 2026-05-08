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

var app = require('../app.js');
var state                = app.state;
var uid                  = app.uid;
var processInput         = app.processInput;
var handleItemViewByNumber = app.handleItemViewByNumber;
var handleItemViewAction   = app.handleItemViewAction;
var handleItemViewNotes    = app.handleItemViewNotes;
var showItemDetail         = app.showItemDetail;
var handleItemMoveTarget   = app.handleItemMoveTarget;
var addItem                = app.addItem;
var reviewBox              = app.reviewBox;
var removeItem             = app.removeItem;
var getBudgetItems         = app.getBudgetItems;
handleTrashDelete          = app.handleTrashDelete;
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
  var item = { id: uid(), name: name, fate: fate||'unsure', description: '', notes: notes||'', photos: [], addedAt: new Date().toISOString(), deleted_at: null };
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

// 2. Item detail does not show photo info (feature deactivated)
console.log('\n2. Item detail does not show photo references (photos deactivated)');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
handleItemViewByNumber(1);
assert('no photo count shown', !lastBotMessage || lastBotMessage.indexOf('photo') === -1);

// 3. Item detail does not mention photos at all
console.log('\n3. Item detail has no photo copy anywhere');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Chair', 'donate');
handleItemViewByNumber(1);
assert('no photos text', !lastBotMessage || lastBotMessage.indexOf('No photos') === -1);
assert('no photo count text', !lastBotMessage || lastBotMessage.indexOf('photo(s)') === -1);

// 4. Item detail chips include Change fate, Edit notes, Remove, Back to list
console.log('\n4. Item detail offers correct action chips');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
handleItemViewByNumber(1);
assert('Change fate chip', lastChips.indexOf('Change fate') !== -1);
assert('Edit notes chip', lastChips.indexOf('Edit notes') !== -1);
assert('Trash chip', lastChips.indexOf('Trash') !== -1);
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

// 6. "Trash" from item view triggers trash flow, "Yes" deletes
console.log('\n6. Trash from item view then Yes deletes the item');
reset();
box = makeBox('Test Box', 'bedroom');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'donate');
handleItemViewByNumber(1);
handleItemViewAction('trash');
assert('stage set to AWAITING_TRASH_DELETE', state.conversationStage === 'AWAITING_TRASH_DELETE');
app.handleTrashDelete('yes');
var activeItems = box.items.filter(function(it) { return !it.deleted_at; });
assert('item removed', activeItems.length === 1);
assert('correct item removed', activeItems[0].name === 'Chair');

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

// ── Move item to box ──────────────────────────────────────────────────────────

console.log('\nMove item: Move to box chip appears in item detail');
reset();
var srcBox = makeBox('Kitchen', 'kitchen');
makeItem(srcBox, 'Bowl', 'keep');
state.activeBoxId = srcBox.id;
showItemDetail(groupItems(srcBox.items)[0], 0);
assert('Move to box chip shown', lastChips.indexOf('Move to box') !== -1);

console.log('\nMove item: moves item to target box');
reset();
var src = makeBox('Kitchen', 'kitchen');
var dst = makeBox('Car', 'garage');
makeItem(src, 'Bowl', 'keep');
state.activeBoxId = src.id;
showItemDetail(groupItems(src.items)[0], 0);
handleItemViewAction('move to box');
handleItemMoveTarget('Car');
var srcActive = src.items.filter(function(it) { return !it.deleted_at; });
assert('item removed from source', srcActive.length === 0);
assert('item added to target', dst.items.length === 1);
assert('item name preserved', dst.items[0].name === 'Bowl');

console.log('\nMove item: moves all items in a group');
reset();
var src2 = makeBox('Shelf', 'dining room');
var dst2 = makeBox('Car', 'garage');
makeItem(src2, 'Towel', 'keep');
makeItem(src2, 'Towel', 'keep');
makeItem(src2, 'Towel', 'keep');
makeItem(src2, 'Other', 'keep');
state.activeBoxId = src2.id;
showItemDetail(groupItems(src2.items)[0], 0);
handleItemViewAction('move to box');
handleItemMoveTarget('Car');
assert('all group items moved', dst2.items.length === 3);
assert('non-group item stays', src2.items.length === 1);
assert('remaining item is Other', src2.items[0].name === 'Other');

console.log('\nMove item: unknown box name shows error and re-offers chips');
reset();
var src3 = makeBox('Kitchen', 'kitchen');
makeBox('Car', 'garage');
makeItem(src3, 'Bowl', 'keep');
state.activeBoxId = src3.id;
showItemDetail(groupItems(src3.items)[0], 0);
handleItemViewAction('move to box');
handleItemMoveTarget('Nonexistent Box');
assert('error message shown', lastBotMessage.indexOf('Couldn\'t find') !== -1);
assert('chips re-offered', lastChips.indexOf('Car') !== -1);

console.log('\nMove item: cancel returns to item detail');
reset();
var src4 = makeBox('Kitchen', 'kitchen');
makeBox('Car', 'garage');
makeItem(src4, 'Bowl', 'keep');
state.activeBoxId = src4.id;
showItemDetail(groupItems(src4.items)[0], 0);
handleItemViewAction('move to box');
handleItemMoveTarget('cancel');
assert('stage back to item view', state.conversationStage === 'AWAITING_ITEM_VIEW');


// ── addItem / removeItem helpers ──────────────────────────────────────────────

console.log('\naddItem: pushes item to box and decrements budget');
reset();
var box = makeBox('Box', 'room');
var before = getBudgetItems();
var item = { id: uid(), name: 'Lamp', fate: 'keep', description: '', notes: '', photos: [], addedAt: '' };
addItem(box, item);
assert('item pushed to box', box.items.length === 1);
assert('item is correct', box.items[0].name === 'Lamp');
assert('budget decremented', getBudgetItems() === before - 1);

console.log('\naddItem: returns the item');
reset();
var box2 = makeBox('Box', 'room');
var item2 = { id: uid(), name: 'Chair', fate: 'keep', description: '', notes: '', photos: [], addedAt: '' };
var returned = addItem(box2, item2);
assert('returns item', returned === item2);

console.log('\nremoveItem: removes item by id and increments budget');
reset();
var box3 = makeBox('Box', 'room');
var item3 = { id: uid(), name: 'Lamp', fate: 'keep', description: '', notes: '', photos: [], addedAt: '' };
addItem(box3, item3);
var afterAdd = getBudgetItems();
var removed = removeItem(box3, item3.id);
assert('item removed', box3.items.length === 0);
assert('returns count removed', removed === 1);
assert('budget incremented', getBudgetItems() === afterAdd + 1);

console.log('\nremoveItem: returns 0 and leaves budget unchanged for unknown id');
reset();
var box4 = makeBox('Box', 'room');
var item4 = { id: uid(), name: 'Lamp', fate: 'keep', description: '', notes: '', photos: [], addedAt: '' };
addItem(box4, item4);
var beforeRemove = getBudgetItems();
var removedCount = removeItem(box4, 'nonexistent-id');
assert('returns 0', removedCount === 0);
assert('item still in box', box4.items.length === 1);
assert('budget unchanged', getBudgetItems() === beforeRemove);


console.log('\nreviewBox: shows chips when box is empty');
reset();
var emptyBox = makeBox('Empty box', 'room');
state.activeBoxId = emptyBox.id;
lastChips = [];
reviewBox();
assert('shows empty message', lastBotMessage.indexOf('no items') !== -1);
assert('chips shown after empty message', lastChips.length > 0);
assert('Add item chip present', lastChips.indexOf('Add item') !== -1);


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
