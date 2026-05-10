// test_promote.js — Tests for item → box promotion
// Run with: node tests/test_promote.js (from project root)

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var lastChips = [];

global.addBotMessage = function(text) { lastBotMessage = text; };
global.addUserMessage = function() {};
global.setChips = function(chips) { lastChips = chips || []; };
global.setBoxOpenChips = function() { lastChips = []; };
global.renderSidebar = function() {};
global.updateContextBar = function() {};
global.showTyping = function() {};
global.hideTyping = function() {};
global.saveState = function() {};
global.chipClick = function() {};
global.escHtml = function(s) { return String(s || ''); };
global.renderMarkdown = function(s) { return s; };
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.confirm = function() { return true; };
global.document = {
  getElementById: function() {
    return { innerHTML: '', style: {}, className: '', onclick: null,
             classList: { add: function() {}, remove: function() {} },
             appendChild: function() {}, scrollTop: 0, scrollHeight: 0 };
  },
  createElement: function() { return { className: '', innerHTML: '', appendChild: function() {} }; }
};

var app = require('../app.js');
var state = app.state;
var uid = app.uid;
var promoteItemToBox = app.promoteItemToBox;
var processInput = app.processInput;
var showItemDetail = app.showItemDetail;
var groupItems = app.groupItems;

// Patch _setChipsImpl to capture chips
app._setChipsImpl = function(chips) { lastChips = chips || []; };

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
  state.activeItemViewGroup = null;
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  lastChips = [];
}

function makeBox(name, location, parentId) {
  var box = {
    id: uid(), name: name, location: location || 'room',
    notes: '', parentId: parentId || null, createdAt: new Date().toISOString(), items: []
  };
  state.boxes.push(box);
  return box;
}

function makeItem(box, name, fate, notes, description) {
  var item = {
    id: uid(), name: name, fate: fate || 'unsure',
    notes: notes || '', description: description || '',
    createdAt: new Date().toISOString(), deleted_at: null
  };
  box.items.push(item);
  return item;
}

// ── TESTS ─────────────────────────────────────────────────────────────────────
console.log('\nItem → Box Promotion Tests\n');

console.log('1. promoteItemToBox: creates a nested box with correct fields');
reset();
var parent = makeBox('higher shelf', 'dining room');
var item = makeItem(parent, 'Berkeley Bowl bag', 'keep', 'eggplant colored');
promoteItemToBox(item, parent);
assert('new box created', state.boxes.length === 2);
var newBox = state.boxes.find(function(b) { return b.name === 'Berkeley Bowl bag'; });
assert('new box exists', !!newBox);
assert('id retained from item', newBox.id === item.id);
assert('name from item', newBox.name === 'Berkeley Bowl bag');
assert('location from parent', newBox.location === 'dining room');
assert('parentId is parent box', newBox.parentId === parent.id);
assert('fate retained', newBox.fate === 'keep');
assert('notes from item', newBox.notes === 'eggplant colored');
assert('createdAt from item', newBox.createdAt === item.createdAt);
assert('starts with no items', newBox.items.length === 0);

console.log('\n2. promoteItemToBox: soft-deletes item from parent');
reset();
var parent2 = makeBox('shelf', 'garage');
var item2 = makeItem(parent2, 'bag', 'keep');
promoteItemToBox(item2, parent2);
assert('item soft-deleted', item2.deleted_at !== null);
assert('item still in parent.items array', parent2.items.length === 1);

console.log('\n3. promoteItemToBox: selects new box and sets BOX_OPEN');
reset();
var parent3 = makeBox('shelf', 'garage');
var item3 = makeItem(parent3, 'bag', 'keep');
promoteItemToBox(item3, parent3);
assert('activeBoxId is new box', state.activeBoxId === item3.id);
assert('stage is BOX_OPEN', state.conversationStage === 'BOX_OPEN');

console.log('\n4. promoteItemToBox: confirmation message mentions box and parent');
reset();
var parent4 = makeBox('top shelf', 'dining room');
var item4 = makeItem(parent4, 'Trader Joe bag', 'return', 'lilac colored');
promoteItemToBox(item4, parent4);
assert('message mentions item name', lastBotMessage.includes('Trader Joe bag'));
assert('message mentions parent name', lastBotMessage.includes('top shelf'));
assert('message mentions notes', lastBotMessage.includes('lilac colored'));

console.log('\n5. promoteItemToBox: chips include Add item, Review items, Back to parent');
reset();
var parent5 = makeBox('top shelf', 'dining room');
var item5 = makeItem(parent5, 'bag', 'keep');
promoteItemToBox(item5, parent5);
assert('Add item chip', lastChips.includes('Add item'));
assert('Review items chip', lastChips.includes('Review items'));
assert('Back to parent chip', lastChips.some(function(c) { return c.startsWith('Back to'); }));

console.log('\n6. promoteItemToBox: name collision blocked');
reset();
var parent6 = makeBox('shelf', 'garage');
makeBox('bag', 'garage'); // existing box with same name at same location
var item6 = makeItem(parent6, 'bag', 'keep');
promoteItemToBox(item6, parent6);
assert('no new box created', state.boxes.length === 2); // parent6 + existing 'bag' box
assert('item not soft-deleted', item6.deleted_at === null);
assert('collision message shown', lastBotMessage.includes('already exists'));

console.log('\n7. promoteItemToBox: notes + description merged');
reset();
var parent7 = makeBox('shelf', 'room');
var item7 = makeItem(parent7, 'bag', 'keep', 'eggplant colored', 'Berkeley Bowl branded');
promoteItemToBox(item7, parent7);
var newBox7 = state.boxes.find(function(b) { return b.name === 'bag'; });
assert('notes merged', newBox7.notes.includes('eggplant colored'));
assert('description merged', newBox7.notes.includes('Berkeley Bowl branded'));

console.log('\n8. showItemDetail: Make it a box chip shown for single item');
reset();
var parent8 = makeBox('shelf', 'room');
makeItem(parent8, 'bag', 'keep');
state.activeBoxId = parent8.id;
var groups = groupItems(parent8.items);
showItemDetail(groups[0], 0);
assert('Make it a box chip present', lastChips.includes('Make it a box'));

console.log('\n9. showItemDetail: Make it a box chip hidden for grouped items (count > 1)');
reset();
var parent9 = makeBox('shelf', 'room');
makeItem(parent9, 'bag', 'keep');
makeItem(parent9, 'bag', 'keep'); // duplicate — count = 2
state.activeBoxId = parent9.id;
var groups9 = groupItems(parent9.items);
showItemDetail(groups9[0], 0);
assert('Make it a box chip absent', !lastChips.includes('Make it a box'));

console.log('\n10. promoteItemToBox: item with no notes produces no notes line in message');
reset();
var parent10 = makeBox('shelf', 'room');
var item10 = makeItem(parent10, 'bag', 'keep', '', '');
promoteItemToBox(item10, parent10);
assert('no notes line in message', !lastBotMessage.includes('Notes carried over'));

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log('✅ ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
