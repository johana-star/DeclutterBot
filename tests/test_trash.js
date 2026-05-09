// test_trash.js — Tests for trash deletion flow
// Run with: node tests/test_trash.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];
var localStorageData = {};

global.addBotMessage    = function(text) { lastBotMessage = text; };
global.addUserMessage   = function() {};
global.setChips         = function(chips) { lastChips = chips; };
global.renderSidebar    = function() {};
global.updateContextBar = function() {};
global.showTyping       = function() {};
global.hideTyping       = function() {};
global.saveState        = function() {};
global.chipClick        = function() {};
global.escHtml          = function(s) { return String(s||''); };
global.renderMarkdown   = function(s) { return s; };
global.localStorage     = {
  getItem:    function(k) { return localStorageData[k] || null; },
  setItem:    function(k,v) { localStorageData[k] = v; },
  removeItem: function(k) { delete localStorageData[k]; }
};
global.document = {
  getElementById: function() { return { innerHTML: '', value: '', style: {}, scrollTop: 0, textContent: '' }; },
  createElement:  function() { return { className: '', innerHTML: '', appendChild: function(){}, style: {} }; }
};

var app = require('../app.js');
var state                    = app.state;
var uid                      = app.uid;
var processInput             = app.processInput;
var handleTrashDelete        = app.handleTrashDelete;
var handleTrashByNumber      = app.handleTrashByNumber;
var handleDeleteByNumber     = app.handleDeleteByNumber;
var getBoxTrashPreferences   = app.getBoxTrashPreferences;
var handleDisposal           = app.handleDisposal;
var disposalPrompt           = app.disposalPrompt;
var deletionLog              = app.deletionLog;
var deleteActiveItem         = app.deleteActiveItem;
var getSessionTrashPreference = app.getSessionTrashPreference;
var setSessionTrashPreference = app.setSessionTrashPreference;
var getSessionDeletedCount   = app.getSessionDeletedCount;
var resetSessionCounts       = app.resetSessionCounts;

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
  state.pendingFateReview = null;
  state.conversationStage = 'BOX_OPEN';
  state.emptyBoxesForDelete = null;
  state.emptyBoxPositions = null;
  state.renamePositions = null;
  state.pendingRenameBoxId = null;
  state.movePositions = null;
  state.pendingMoveBoxId = null;
  localStorageData = {};
  resetSessionCounts();
  lastBotMessage = null;
  lastChips = [];
}
function makeBox(name) {
  var box = { id: uid(), name: name, location: 'bedroom', notes: '', parentId: null, createdAt: '', items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}
function makeItem(box, name, fate) {
  var item = { id: uid(), name: name, fate: fate||'unsure', description: '', notes: '', photos: [], addedAt: '', deleted_at: null };
  box.items.push(item);
  state.activeItemId = item.id;
  return item;
}

console.log('\nTrash Deletion Flow Tests\n');

// ── DISPOSAL PROMPT ───────────────────────────────────────────────────────────
console.log('1. Disposal prompt — batteries (specific copy)');
assertIncludes('battery copy', disposalPrompt('AA batteries'), 'libraries');
assertIncludes('lithium copy', disposalPrompt('lithium battery pack'), 'libraries');

console.log('\n2. Disposal prompt — e-waste');
assertIncludes('laptop copy', disposalPrompt('old laptop'), 'E-waste');
assertIncludes('charger copy', disposalPrompt('phone charger'), 'E-waste');
assertIncludes('monitor copy', disposalPrompt('computer monitor'), 'E-waste');

console.log('\n3. Disposal prompt — clothing');
assertIncludes('shirt copy', disposalPrompt('old shirt'), 'donated');
assertIncludes('jacket copy', disposalPrompt('winter jacket'), 'donated');

console.log('\n4. Disposal prompt — hazardous');
assertIncludes('paint copy', disposalPrompt('old paint can'), 'Hazardous');
assertIncludes('bleach copy', disposalPrompt('bleach'), 'Hazardous');

console.log('\n5. Disposal prompt — generic fallback');
assertIncludes('generic copy', disposalPrompt('random stuff'), 'safely disposed');
assertIncludes('unknown item generic', disposalPrompt('mystery box'), 'safely disposed');

// ── TRASH FATE TRIGGERS DELETE PROMPT ────────────────────────────────────────
console.log('\n6. Marking item as trash triggers delete prompt');
reset();
var box = makeBox('Test Box');
makeItem(box, 'Old lamp', 'unsure');
state.conversationStage = 'AWAITING_FATE';
processInput('trash', []);
assert('stage set to AWAITING_TRASH_DELETE', state.conversationStage === 'AWAITING_TRASH_DELETE');
assertIncludes('asks to delete', lastBotMessage, 'delete');
assert('Yes chip shown', lastChips.indexOf('Yes') !== -1);
assert('No chip shown', lastChips.indexOf('No') !== -1);
assert('Always chip shown', lastChips.indexOf('Always this session') !== -1);
assert('Never chip shown', lastChips.indexOf('Never this session') !== -1);

// ── YES — DELETE IMMEDIATELY ──────────────────────────────────────────────────
console.log('\n7. Yes — item deleted immediately');
reset();
box = makeBox('Test Box');
makeItem(box, 'Old lamp', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('yes');
assert('item removed from box', box.items[0].deleted_at !== null && box.items[0].deleted_at !== undefined);
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assertIncludes('deletion logged', lastBotMessage, 'Deleted');
assertIncludes('item name in log', lastBotMessage, 'Old lamp');

// ── DELETION COUNT ────────────────────────────────────────────────────────────
console.log('\n8. Deletion count increments correctly');
reset();
box = makeBox('Test Box');
makeItem(box, 'Item A', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('yes');
assertIncludes('shows 1 deleted today', lastBotMessage, '1 deleted today');
assert('session count is 1', getSessionDeletedCount() === 1);

makeItem(box, 'Item B', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('yes');
assertIncludes('shows 2 deleted today', lastBotMessage, '2 deleted today');
assert('session count is 2', getSessionDeletedCount() === 2);

// ── ALWAYS ───────────────────────────────────────────────────────────────────
console.log('\n9. Always — sets preference and deletes');
reset();
box = makeBox('Test Box');
makeItem(box, 'Broken thing', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('always this session');
assert('item deleted', box.items[0].deleted_at !== null && box.items[0].deleted_at !== undefined);
assert('preference set to always', getSessionTrashPreference() === 'always');

console.log('\n10. Always — subsequent trash items auto-deleted without prompt');
reset();
setSessionTrashPreference('always');
box = makeBox('Test Box');
makeItem(box, 'Auto-deleted', 'unsure');
state.conversationStage = 'AWAITING_FATE';
processInput('trash', []);
assert('item auto-deleted', box.items[0].deleted_at !== null && box.items[0].deleted_at !== undefined);
assert('stage is BOX_OPEN not AWAITING_TRASH_DELETE', state.conversationStage === 'BOX_OPEN');
assertIncludes('deletion logged', lastBotMessage, 'Deleted');

// ── NO — DISPOSAL PROMPT ──────────────────────────────────────────────────────
console.log('\n11. No — triggers disposal prompt');
reset();
box = makeBox('Test Box');
var item11 = makeItem(box, 'old laptop', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('no');
assert('item kept', box.items.length === 1);
assert('stage set to AWAITING_DISPOSAL', state.conversationStage === 'AWAITING_DISPOSAL');
assertIncludes('context-aware disposal prompt', lastBotMessage, 'E-waste');

console.log('\n12. Disposal answer prepended to notes');
reset();
box = makeBox('Test Box');
makeItem(box, 'Old coat', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('no');
handleDisposal('the charity shop on Main St');
assert('notes updated', box.items[0].notes.indexOf('Safely dispose at: the charity shop') !== -1);
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');

console.log('\n13. Disposal note appended to existing notes');
reset();
box = makeBox('Test Box');
var item13 = makeItem(box, 'Paint can', 'trash');
item13.notes = 'half full';
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('no');
handleDisposal('hazardous waste facility');
assert('existing notes preserved', box.items[0].notes.indexOf('half full') !== -1);
assert('disposal note appended', box.items[0].notes.indexOf('Safely dispose at:') !== -1);

console.log('\n14. Skip disposal note — item kept with no note added');
reset();
box = makeBox('Test Box');
makeItem(box, 'mystery item', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('no');
handleDisposal('skip disposal note');
assert('item kept', box.items.length === 1);
assert('notes unchanged', box.items[0].notes === '');
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');

// ── NEVER ────────────────────────────────────────────────────────────────────
console.log('\n15. Never — sets preference, skips delete prompt on next trash');
reset();
box = makeBox('Test Box');
makeItem(box, 'First item', 'trash');
state.conversationStage = 'AWAITING_TRASH_DELETE';
handleTrashDelete('never this session');
assert('preference set to never', getSessionTrashPreference() === 'never');
assert('item kept', box.items.length === 1);
assert('disposal prompt shown', state.conversationStage === 'AWAITING_DISPOSAL');

console.log('\n16. Never — subsequent trash goes straight to disposal prompt');
reset();
setSessionTrashPreference('never');
box = makeBox('Test Box');
makeItem(box, 'Second item', 'unsure');
state.conversationStage = 'AWAITING_FATE';
processInput('trash', []);
assert('skipped delete prompt', state.conversationStage === 'AWAITING_DISPOSAL');
assert('item kept', box.items.length === 1);

// ── SESSION RESET ─────────────────────────────────────────────────────────────
console.log('\n17. Session counts reset independently of state');
reset();
assert('session deleted count resets', getSessionDeletedCount() === 0);
assert('session preference resets', getSessionTrashPreference() === null);

// ── TRASH N FROM REVIEW SCREEN ───────────────────────────────────────────────

console.log('\n18. trash <n> from review screen triggers deletion flow');
reset();
box = makeBox('Test Box');
makeItem(box, 'Item A', 'keep');
makeItem(box, 'Item B', 'unsure');
processInput('trash 2', []);
assert('stage set to AWAITING_TRASH_DELETE', state.conversationStage === 'AWAITING_TRASH_DELETE');
assert('Item B marked as trash', box.items[1].fate === 'trash');

console.log('\n19. trash <n> out of range shows error');
reset();
box = makeBox('Test Box');
makeItem(box, 'Only Item', 'keep');
processInput('trash 5', []);
assert('error shown', lastBotMessage !== null && lastBotMessage.indexOf('No item 5') !== -1);
assert('item not removed', box.items.length === 1);

console.log('\n20. delete 1 (already-trashed item) increments deletion count');
reset();
box = makeBox('Test Box');
makeItem(box, 'Lamp', 'trash');
processInput('delete 1', []);
assert('deletion logged in message', lastBotMessage && lastBotMessage.indexOf('Deleted') !== -1);
assert('session count incremented', app.getSessionDeletedCount() === 1);

console.log('\n21. Trash N chips shown in review (not Remove N)');
reset();
box = makeBox('Test Box');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'donate');
makeItem(box, 'Rug', 'unsure'); // third trashable item triggers Trash... elliptical
processInput('review items', []);
assert('Trash... chip shown', lastChips.indexOf('Trash...') !== -1);
assert('no numbered Trash chips', !lastChips.some(c => /^Trash \d+$/.test(c)));
assert('no Delete chips when no trash-fated items', !lastChips.some(c => c.startsWith('Delete ')));
assert('no Remove chips', !lastChips.some(function(c){ return c.startsWith('Remove'); }));


console.log('\nTrash N from box review: returns to review list after yes');
reset();
var box = makeBox('Box', 'room');
makeItem(box, 'Lamp', 'keep');
makeItem(box, 'Chair', 'trash');
state.activeBoxId = box.id;
processInput('review items', []);
handleTrashByNumber(2); // trash Chair
handleTrashDelete('yes');
// Should show review list, not generic BOX_OPEN chips
assert('review list chips shown', lastChips.some(c => c.startsWith('Trash') || c.startsWith('Delete')));
assert('Add item chip shown', lastChips.indexOf('Add item') !== -1);
assert('_reviewingBox flag cleared', !state._reviewingBox);

console.log('\nTrash N from box review: returns to review list after no + skip disposal');
reset();
var box2 = makeBox('Box', 'room');
makeItem(box2, 'Lamp', 'keep');
makeItem(box2, 'Chair', 'trash');
state.activeBoxId = box2.id;
processInput('review items', []);
handleTrashByNumber(2);
handleTrashDelete('no');
processInput('skip disposal note', []);
// Item kept — should still return to review list
assert('review list shown after no+skip', lastChips.some(c => c.startsWith('Trash') || c.startsWith('Delete') || c === 'Add item'));
assert('_reviewingBox flag cleared', !state._reviewingBox);


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
