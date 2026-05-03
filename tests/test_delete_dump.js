// test_delete_dump.js — Tests for delete box and dump into box features
// Run with: node test_delete_dump.js

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
var state                  = app.state;
var uid                    = app.uid;
var processInput           = app.processInput;
var handleDeleteBox        = app.handleDeleteBox;
var handleDeleteBoxConfirm = app.handleDeleteBoxConfirm;
var handleDump             = app.handleDump;
var handleDumpTarget       = app.handleDumpTarget;

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
  state.conversationStage = 'BOX_OPEN';
  state.conversationHistory = [];
  lastBotMessage = null;
  lastChips = [];
}
function makeBox(name, location) {
  var box = { id: uid(), name: name, location: location||'', notes: '', createdAt: new Date().toISOString(), items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}
function makeItem(box, name, fate) {
  var item = { id: uid(), name: name, fate: fate||'unsure', description: '', notes: '', photos: [], addedAt: new Date().toISOString() };
  box.items.push(item);
  return item;
}

// ── DELETE BOX TESTS ──────────────────────────────────────────────────────────
console.log('\nDelete Box Tests\n');

console.log('1. Cannot delete a box with items — shows error with hint');
reset();
var box = makeBox('Garage Box', 'garage');
makeItem(box, 'Lamp', 'keep');
handleDeleteBox();
assert('box not deleted', state.boxes.length === 1);
assertIncludes('mentions item count', lastBotMessage, '1 item');
assertIncludes('suggests dump', lastBotMessage, 'dump');

console.log('\n2. Empty box prompts for confirmation');
reset();
box = makeBox('Empty Box', 'bedroom');
handleDeleteBox();
assert('stage set to confirm', state.conversationStage === 'AWAITING_DELETE_BOX_CONFIRM');
assert('pendingDeleteBoxId set', state.pendingDeleteBoxId === box.id);
assertIncludes('asks to confirm', lastBotMessage, 'Delete');
assert('yes chip present', lastChips.indexOf('Yes, delete it') !== -1);
assert('no chip present', lastChips.indexOf('No, keep it') !== -1);

console.log('\n3. Confirming deletion removes the box');
reset();
box = makeBox('Empty Box', 'bedroom');
handleDeleteBox();
handleDeleteBoxConfirm('yes');
assert('box removed', state.boxes.length === 0);
assert('activeBoxId cleared', state.activeBoxId === null);
assertIncludes('confirms deletion', lastBotMessage, 'Deleted');

console.log('\n4. Declining deletion keeps the box');
reset();
box = makeBox('Empty Box', 'bedroom');
handleDeleteBox();
handleDeleteBoxConfirm('no');
assert('box kept', state.boxes.length === 1);
assert('stage back to BOX_OPEN', state.conversationStage === 'BOX_OPEN');
assertIncludes('confirms kept', lastBotMessage, 'Kept');

console.log('\n5. "y" shorthand confirms deletion');
reset();
box = makeBox('Empty Box', 'bedroom');
handleDeleteBox();
processInput('y', []);
assert('box deleted via y', state.boxes.length === 0);

console.log('\n6. "n" shorthand keeps the box');
reset();
box = makeBox('Empty Box', 'bedroom');
handleDeleteBox();
processInput('n', []);
assert('box kept via n', state.boxes.length === 1);

console.log('\n7. Delete box with no active box shows error');
reset();
handleDeleteBox();
assertIncludes('explains no active box', lastBotMessage, 'No active box');

console.log('\n8. Delete box chip triggers flow');
reset();
box = makeBox('Empty Box', 'bedroom');
processInput('delete box', []);
assert('stage set to confirm', state.conversationStage === 'AWAITING_DELETE_BOX_CONFIRM');

// ── DUMP TESTS ────────────────────────────────────────────────────────────────
console.log('\nDump Tests\n');

console.log('9. Dump with no target prompts with box name chips');
reset();
var src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
makeItem(src, 'Chair', 'donate');
var dst = makeBox('Dest Box', 'living room');
state.activeBoxId = src.id;
handleDump('dump');
assert('stage set to AWAITING_DUMP_TARGET', state.conversationStage === 'AWAITING_DUMP_TARGET');
assertIncludes('shows item count', lastBotMessage, '2 item');
assert('dest box chip shown', lastChips.some(function(c){ return c.indexOf('Dest Box') !== -1; }));
assert('source box not shown as chip', lastChips.indexOf('Source Box') === -1);

console.log('\n10. Dump into target by exact name transfers all items');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
makeItem(src, 'Chair', 'donate');
dst = makeBox('Dest Box', 'living room');
state.activeBoxId = src.id;
handleDumpTarget('Dest Box');
assert('source box now empty', src.items.length === 0);
assert('dest box has 2 items', dst.items.length === 2);
assert('items transferred correctly', dst.items[0].name === 'Lamp' && dst.items[1].name === 'Chair');
assertIncludes('confirms dump', lastBotMessage, 'Dumped');
assertIncludes('confirms count', lastBotMessage, '2');

console.log('\n11. Dump target matched case-insensitively');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
dst = makeBox('Dest Box', 'living room');
state.activeBoxId = src.id;
handleDumpTarget('dest box');
assert('items transferred', dst.items.length === 1);

console.log('\n12. Dump target matched partially');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
dst = makeBox('Living Room Shelf', 'living room');
state.activeBoxId = src.id;
handleDumpTarget('living room');
assert('items transferred via partial match', dst.items.length === 1);

console.log('\n13. Dump unknown target creates a new box and transfers items');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
state.activeBoxId = src.id;
handleDumpTarget('Brand New Box');
assert('source now empty', src.items.length === 0);
assert('new box created', state.boxes.length === 2);
assert('new box has the item', state.boxes[1].items.length === 1);
assert('new box has correct name', state.boxes[1].name === 'Brand New Box');
assert('stage awaiting location for new box', state.conversationStage === 'AWAITING_LOCATION');
assertIncludes('confirms creation and dump', lastBotMessage, 'Created');

console.log('\n14. Dump empty box shows message without transferring');
reset();
src = makeBox('Empty Source', 'bedroom');
dst = makeBox('Dest Box', 'living room');
state.activeBoxId = src.id;
handleDump('dump');
assert('no stage change', state.conversationStage === 'BOX_OPEN');
assertIncludes('says already empty', lastBotMessage, 'empty');

console.log('\n15. After dump, Delete box chip is offered');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
dst = makeBox('Dest Box', 'living room');
state.activeBoxId = src.id;
handleDumpTarget('Dest Box');
assert('Delete box chip shown after dump', lastChips.indexOf('Delete box') !== -1);

console.log('\n16. Dump inline: "dump into <name>" without prompting');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
dst = makeBox('Dest Box', 'living room');
state.activeBoxId = src.id;
processInput('dump into Dest Box', []);
assert('items transferred directly', dst.items.length === 1);
assert('source now empty', src.items.length === 0);

console.log('\n17. Dump chip label includes location for different-room boxes');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
dst = makeBox('Only Other Box', 'hall');
state.activeBoxId = src.id;
handleDump('dump');
assert('chip includes box name', lastChips.some(function(c){ return c.indexOf('Only Other Box') !== -1; }));
assert('chip includes location prefix', lastChips.some(function(c){ return c.indexOf('hall') !== -1; }));

console.log('\n18. Dump with no other boxes shows error');
reset();
src = makeBox('Lonely Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
state.activeBoxId = src.id;
handleDump('dump');
assertIncludes('says no other boxes', lastBotMessage, 'no other boxes');
assert('stage set to AWAITING_DUMP_TARGET to allow typing new name', state.conversationStage === 'AWAITING_DUMP_TARGET');

console.log('\n19. Same-room dump chips show just box name (no location prefix)');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
dst = makeBox('Other Box', 'bedroom');
state.activeBoxId = src.id;
handleDump('dump');
assert('chip is just box name (no location prefix)', lastChips.indexOf('Other Box') !== -1);

console.log('\n20. Dump inline with location-prefixed chip label resolves correctly');
reset();
src = makeBox('Source Box', 'bedroom');
makeItem(src, 'Lamp', 'keep');
dst = makeBox('Top Shelf', 'dining room');
state.activeBoxId = src.id;
processInput('dump into dining room · Top Shelf', []);
assert('items transferred via prefixed label', dst.items.length === 1);
assert('source empty', src.items.length === 0);


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
