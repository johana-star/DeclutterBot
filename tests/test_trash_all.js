// test_trash_all.js — Tests for trash all feature
// Run with: node test_trash_all.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];

global.addBotMessage = function(text) { lastBotMessage = text; };
global.addUserMessage = function() {};
global.setChips = function(chips) { lastChips = chips; };
global.setBoxOpenChips = function() { lastChips = ['Add item', 'Review items', 'Move box', 'Done with this box']; };
global.renderSidebar = function() {};
global.updateContextBar = function() {};
global.showTyping = function() {};
global.hideTyping = function() {};
global.saveState = function() {};
global.chipClick = function() {};
global.escHtml = function(s) { return String(s||''); };
global.renderMarkdown = function(s) { return s; };
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };

var app = require('../app.js');
var state = app.state;
var uid = app.uid;
var trashAllItems = app.trashAllItems;
var deleteAllItems = app.deleteAllItems;
var handleTrashAll = app.handleTrashAll;
var handleTrashAllConfirm = app.handleTrashAllConfirm;
var handleDeleteTrashedConfirm = app.handleDeleteTrashedConfirm;
var handleDeleteBoxAfterTrashAllConfirm = app.handleDeleteBoxAfterTrashAllConfirm;
var groupItems = app.groupItems;
var countFates = app.countFates;

// Override reviewBox and handleFinished to not modify lastBotMessage in tests
global.reviewBox = function() { /* no-op for testing */ };
global.handleFinished = function() { /* no-op for testing */ };

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  ✅ ' + desc); passed++; }
  else           { console.error('  ❌ ' + desc); failed++; }
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(name, location) {
  var box = { id: uid(), name: name, location: location || '', notes: '', parentId: null, createdAt: '', items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}

function makeItem(box, name, fate, notes) {
  var item = { id: uid(), name: name, fate: fate||'unsure', description: '', notes: notes||'', photos: [], addedAt: '', deleted_at: null };
  box.items.push(item);
  return item;
}

// ── TESTS ──────────────────────────────────────────────────────────────────────

console.log('\nTrash All Tests\n');

console.log('1. trashAllItems: marks active items as trash');
reset();
var box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
makeItem(box, 'Plate', 'donate', '');
var trashed = trashAllItems(box);
assert('returns count', trashed === 2);
assert('item 1 fate trash', box.items[0].fate === 'trash');
assert('item 2 fate trash', box.items[1].fate === 'trash');

console.log('\n2. trashAllItems: skips soft-deleted items');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
makeItem(box, 'Trash', 'trash', '');
box.items[1].deleted_at = '2026-05-08T00:00:00Z';
var trashed = trashAllItems(box);
assert('returns 1', trashed === 1);
assert('only active item marked trash', box.items[0].fate === 'trash' && box.items[1].fate === 'trash');
assert('deleted item still deleted', box.items[1].deleted_at !== null);

console.log('\n3. deleteAllItems: soft-deletes active items');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'trash', '');
makeItem(box, 'Plate', 'trash', '');
var deleted = deleteAllItems(box);
assert('returns count', deleted === 2);
assert('item 1 deleted', box.items[0].deleted_at !== null);
assert('item 2 deleted', box.items[1].deleted_at !== null);

console.log('\n4. deleteAllItems: skips soft-deleted items');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'trash', '');
makeItem(box, 'Plate', 'trash', '');
box.items[1].deleted_at = '2026-05-08T00:00:00Z';
var deleted = deleteAllItems(box);
assert('returns 1', deleted === 1);
assert('only active item deleted', box.items[0].deleted_at !== null);
assert('other item still deleted', box.items[1].deleted_at !== null);

console.log('\n5. handleTrashAll: shows confirmation with item count');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
makeItem(box, 'Plate', 'donate', '');
handleTrashAll();
assert('stage set to confirm', state.conversationStage === 'AWAITING_TRASH_ALL_CONFIRM');
assert('shows count', lastBotMessage.includes('2'));
assert('asks for confirmation', lastBotMessage.includes('Delete'));

console.log('\n6. handleTrashAll: handles empty box gracefully');
reset();
box = makeBox('Kitchen', 'kitchen');
handleTrashAll();
assert('shows no items message', lastBotMessage.includes('no items'));

console.log('\n7. handleTrashAllConfirm: yes marks items trash, prepares delete confirm');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
makeItem(box, 'Plate', 'donate', '');
state.conversationStage = 'AWAITING_TRASH_ALL_CONFIRM';
handleTrashAllConfirm('yes');
assert('items marked trash', box.items[0].fate === 'trash' && box.items[1].fate === 'trash');
assert('items NOT deleted', box.items[0].deleted_at === null && box.items[1].deleted_at === null);
assert('stage to delete trashed confirm', state.conversationStage === 'AWAITING_DELETE_TRASHED_CONFIRM');
assert('asks delete trashed', lastBotMessage.includes('Delete all trashed'));

console.log('\n8. handleTrashAllConfirm: no cancels and returns to review');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
state.conversationStage = 'AWAITING_TRASH_ALL_CONFIRM';
handleTrashAllConfirm('no');
assert('items not deleted', box.items[0].deleted_at === null);
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');

console.log('\n9. handleDeleteBoxAfterTrashAllConfirm: yes deletes box and navigates to parent');
reset();
var parent = makeBox('Storage', 'storage');
box = makeBox('Kitchen', 'kitchen');
box.parentId = parent.id;
makeItem(box, 'Bowl', 'trash', '');
state.activeBoxId = box.id;
state.conversationStage = 'AWAITING_DELETE_BOX_AFTER_TRASH_ALL';
handleDeleteBoxAfterTrashAllConfirm('yes');
assert('box removed from state', state.boxes.find(function(b) { return b.id === box.id; }) === undefined);
assert('active box set to parent', state.activeBoxId === parent.id);

console.log('\n10. handleDeleteBoxAfterTrashAllConfirm: no keeps box and shows message');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'trash', '');
state.activeBoxId = box.id;
state.conversationStage = 'AWAITING_DELETE_BOX_AFTER_TRASH_ALL';
handleDeleteBoxAfterTrashAllConfirm('no');
assert('box still in state', state.boxes.find(function(b) { return b.id === box.id; }) !== undefined);
assert('stage BOX_OPEN', state.conversationStage === 'BOX_OPEN');
// Note: message will be overwritten by reviewBox(), so we only check state here

console.log('\n11. Trash All chip appears in reviewBox when 2+ items');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
makeItem(box, 'Plate', 'keep', '');
app.reviewBox();
assert('Trash All chip present with 2 items', lastChips.includes('Trash All'));

console.log('\n11b. Trash All chip NOT present with 1 item');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
app.reviewBox();
assert('Trash All chip absent with 1 item', !lastChips.includes('Trash All'));

console.log('\n12. handleDeleteTrashedConfirm: no keeps items as trash');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
// Mark as trash first
box.items[0].fate = 'trash';
state.conversationStage = 'AWAITING_DELETE_TRASHED_CONFIRM';
handleDeleteTrashedConfirm('no');
assert('items still fate trash', box.items[0].fate === 'trash');
assert('items NOT deleted', box.items[0].deleted_at === null);
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');

console.log('\n13. Full flow: trash all, delete trashed, delete box');
reset();
box = makeBox('Kitchen', 'kitchen');
makeItem(box, 'Bowl', 'keep', '');
makeItem(box, 'Plate', 'keep', '');
state.activeBoxId = box.id;

// Step 1: initiate trash all
handleTrashAll();
assert('step 1: confirm stage', state.conversationStage === 'AWAITING_TRASH_ALL_CONFIRM');

// Step 2: confirm trash all (marks items as trash)
handleTrashAllConfirm('yes');
assert('step 2: items marked trash', box.items[0].fate === 'trash' && box.items[1].fate === 'trash');
assert('step 2: items NOT deleted yet', box.items[0].deleted_at === null && box.items[1].deleted_at === null);
assert('step 2: delete trashed confirm stage', state.conversationStage === 'AWAITING_DELETE_TRASHED_CONFIRM');

// Step 3: confirm delete trashed
handleDeleteTrashedConfirm('yes');
assert('step 3: items deleted', box.items[0].deleted_at !== null && box.items[1].deleted_at !== null);
assert('step 3: delete box confirm stage', state.conversationStage === 'AWAITING_DELETE_BOX_AFTER_TRASH_ALL');

// Step 4: confirm delete box
handleDeleteBoxAfterTrashAllConfirm('yes');
assert('step 4: box removed', state.boxes.find(function(b) { return b.id === box.id; }) === undefined);

// ── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log('✅ ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
