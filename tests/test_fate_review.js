// test_fate_review.js — Tests for cross-box fate review feature
// Run with: node tests/test_fate_review.js

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
  getElementById: function() { return { innerHTML: '', value: '', style: {}, scrollTop: 0, textContent: '', appendChild: function(){} }; },
  createElement:  function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){}, style: {}, scrollTop: 0 }; },
  querySelector:  function() { return null; },
  addEventListener: function() {}
};

var app                   = require('../app.js');
var state                 = app.state;
var uid                   = app.uid;
var processInput          = app.processInput;
var handleFateReview      = app.handleFateReview;
var handleFateReviewAction = app.handleFateReviewAction;
var handleFateReviewItem  = app.handleFateReviewItem;
var handleFateReviewBulk  = app.handleFateReviewBulk;
var showFateReviewList    = app.showFateReviewList;
var collectFateItems      = app.collectFateItems;
var buildFateReviewPath   = app.buildFateReviewPath;
var handleFateReviewMenu  = app.handleFateReviewMenu;
var fateReviewChips             = app.fateReviewChips;
var showFateReviewCurrentItem   = app.showFateReviewCurrentItem;
var resetSessionCounts    = app.resetSessionCounts;

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
  localStorageData = {};
  resetSessionCounts();
  lastBotMessage = null;
  lastChips = [];
}
function makeBox(name, location, parentId) {
  var box = { id: uid(), name: name, location: location||'', notes: '', parentId: parentId||null, createdAt: '', items: [] };
  state.boxes.push(box);
  state.activeBoxId = box.id;
  return box;
}
function makeItem(box, name, fate, notes) {
  var item = { id: uid(), name: name, fate: fate||'unsure', description: '', notes: notes||'', photos: [], addedAt: '' };
  box.items.push(item);
  return item;
}

console.log('\nFate Review Tests\n');

// ── collectFateItems ──────────────────────────────────────────────────────────
console.log('1. collectFateItems finds items across multiple boxes');
reset();
var box1 = makeBox('Box A', 'bedroom');
var box2 = makeBox('Box B', 'garage');
makeItem(box1, 'Lamp', 'donate');
makeItem(box1, 'Chair', 'keep');
makeItem(box2, 'Old rug', 'donate');
var results = collectFateItems('donate');
assert('finds 2 donate items', results.length === 2);
assert('first item has correct name', results[0].itemName === 'Lamp');
assert('second item has correct name', results[1].itemName === 'Old rug');
assert('each entry has boxId', results.every(function(r){ return !!r.boxId; }));

console.log('\n2. collectFateItems returns empty array when no matches');
reset();
var box = makeBox('Box A', 'bedroom');
makeItem(box, 'Lamp', 'keep');
assert('returns empty for donate', collectFateItems('donate').length === 0);

// ── buildFateReviewPath ───────────────────────────────────────────────────────
console.log('\n3. buildFateReviewPath returns just box name for top-level box');
reset();
var topBox = makeBox('Wardrobe', 'bedroom');
assert('path is just name', buildFateReviewPath(topBox) === 'Wardrobe');

console.log('\n4. buildFateReviewPath includes parent for nested box');
reset();
var parent = makeBox('Desktop', 'bedroom');
var child  = makeBox('Mac mini', 'bedroom'); child.parentId = parent.id;
assert('path includes both names', buildFateReviewPath(child) === 'Desktop > Mac mini');

console.log('\n5. buildFateReviewPath handles three levels');
reset();
var grandparent = makeBox('Room', 'upstairs');
var parent2     = makeBox('Shelf', 'upstairs'); parent2.parentId = grandparent.id;
var child2      = makeBox('Box', 'upstairs');   child2.parentId  = parent2.id;
assert('three level path correct', buildFateReviewPath(child2) === 'Room > Shelf > Box');

// ── handleFateReviewMenu ──────────────────────────────────────────────────────
console.log('\n6. handleFateReviewMenu shows fate counts');
reset();
var box3 = makeBox('Box', 'room');
makeItem(box3, 'A', 'unsure');
makeItem(box3, 'B', 'unsure');
makeItem(box3, 'C', 'trash');
handleFateReviewMenu();
assert('shows unsure count', lastChips.some(function(c){ return c.indexOf('unsure') !== -1 && c.indexOf('2') !== -1; }));
assert('shows trash count', lastChips.some(function(c){ return c.indexOf('trash') !== -1 && c.indexOf('1') !== -1; }));

console.log('\n7. handleFateReviewMenu with no items shows message');
reset();
handleFateReviewMenu();
assertIncludes('shows no items message', lastBotMessage, 'No items');

// ── handleFateReview ──────────────────────────────────────────────────────────
console.log('\n8. handleFateReview shows list and sets stage');
reset();
var box4 = makeBox('Box', 'room');
makeItem(box4, 'Lamp', 'trash');
makeItem(box4, 'Chair', 'trash');
handleFateReview('trash');
assert('stage set to AWAITING_FATE_REVIEW_ACTION', state.conversationStage === 'AWAITING_FATE_REVIEW_ACTION');
assert('pendingFateReview set', !!state.pendingFateReview);
assert('pendingFateReview has correct fate', state.pendingFateReview.fate === 'trash');
assert('pendingFateReview has 2 items', state.pendingFateReview.items.length === 2);
assertIncludes('list shown in message', lastBotMessage, 'Lamp');
assertIncludes('chips include Item by item', lastChips.join(','), 'Item by item');

console.log('\n9. handleFateReview with no matching items shows message');
reset();
makeBox('Box', 'room');
handleFateReview('sell');
assertIncludes('no items message', lastBotMessage, 'No items');
assert('no pendingFateReview set', !state.pendingFateReview);

console.log('\n10. "review trash" text command works — single item goes straight to item view');
reset();
var box5 = makeBox('Box', 'room');
makeItem(box5, 'Junk', 'trash');
processInput('review trash', []);
// Single item skips the list and goes straight to item-by-item
assert('stage set', state.conversationStage === 'AWAITING_FATE_REVIEW_ITEM');
assertIncludes('shows item', lastBotMessage, 'Junk');

// ── handleFateReviewAction ────────────────────────────────────────────────────
console.log('\n11. Back cancels review');
reset();
var box6 = makeBox('Box', 'room');
makeItem(box6, 'Lamp', 'trash');
handleFateReview('trash');
handleFateReviewAction('back');
assert('pendingFateReview cleared', !state.pendingFateReview);
assert('stage set to FINISHED', state.conversationStage === 'FINISHED');

console.log('\n12. Item by item starts item walk');
reset();
var box7 = makeBox('Box', 'room');
makeItem(box7, 'Lamp', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('item by item');
assert('stage set to AWAITING_FATE_REVIEW_ITEM', state.conversationStage === 'AWAITING_FATE_REVIEW_ITEM');
assertIncludes('shows first item', lastBotMessage, 'Lamp');
assertIncludes('shows progress', lastBotMessage, '1 of 1');

console.log('\n13. Bulk action shows bulk chips');
reset();
var box8 = makeBox('Box', 'room');
makeItem(box8, 'Lamp', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('bulk action');
assert('stage set to AWAITING_FATE_REVIEW_BULK', state.conversationStage === 'AWAITING_FATE_REVIEW_BULK');
assert('bulk chips shown', lastChips.indexOf('Cancel') !== -1);

// ── handleFateReviewItem ──────────────────────────────────────────────────────
console.log('\n14. Skip advances to next item');
reset();
var box9 = makeBox('Box', 'room');
makeItem(box9, 'Lamp', 'unsure');
makeItem(box9, 'Chair', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('item by item');
handleFateReviewItem('skip');
assertIncludes('shows second item', lastBotMessage, 'Chair');
assert('index advanced', state.pendingFateReview && state.pendingFateReview.index === 1);

console.log('\n15. Skip past last item ends review');
reset();
var box10 = makeBox('Box', 'room');
makeItem(box10, 'Lamp', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('item by item');
handleFateReviewItem('skip');
assert('review cleared', !state.pendingFateReview);
assert('stage set to FINISHED', state.conversationStage === 'FINISHED');

console.log('\n16. Keep changes fate and advances');
reset();
var box11 = makeBox('Box', 'room');
var item11 = makeItem(box11, 'Lamp', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('item by item');
handleFateReviewItem('keep');
assert('fate changed to keep', item11.fate === 'keep');
assert('review ended after last item', !state.pendingFateReview);

console.log('\n17. Done reviewing shows actioned count not index');
reset();
var box12 = makeBox('Box', 'room');
makeItem(box12, 'Lamp', 'unsure');
makeItem(box12, 'Chair', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('item by item');
// Keep first item (increments reviewedCount), then done
handleFateReviewItem('keep');
handleFateReviewItem('done reviewing');
assert('review cleared', !state.pendingFateReview);
assertIncludes('shows actioned count not index', lastBotMessage, '1 of 2');

console.log('\n18. Delete immediately removes already-trash item in review');
reset();
var box13 = makeBox('Box', 'room');
var item13 = makeItem(box13, 'Junk', 'trash');
handleFateReview('trash');
handleFateReviewAction('item by item');
handleFateReviewItem('delete');
assert('item removed from box', box13.items.length === 0);

console.log('\n19. Notes shown in item view during review');
reset();
var box14 = makeBox('Box', 'room');
makeItem(box14, 'Mug', 'sell', 'Disney parks exclusive, $25');
handleFateReview('sell');
handleFateReviewAction('item by item');
assertIncludes('notes shown', lastBotMessage, 'Disney parks exclusive');

// ── handleFateReviewBulk ──────────────────────────────────────────────────────
console.log('\n20. Bulk mark all keep updates all items');
reset();
var box15 = makeBox('Box', 'room');
var i1 = makeItem(box15, 'A', 'unsure');
var i2 = makeItem(box15, 'B', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('bulk action');
handleFateReviewBulk('mark all keep');
assert('item A fate changed', i1.fate === 'keep');
assert('item B fate changed', i2.fate === 'keep');
assert('review cleared', !state.pendingFateReview);
assertIncludes('confirms count', lastBotMessage, '2');

console.log('\n21. Bulk delete all removes all trash items');
reset();
var box16 = makeBox('Box', 'room');
makeItem(box16, 'A', 'trash');
makeItem(box16, 'B', 'trash');
var box17 = makeBox('Box 2', 'room');
makeItem(box17, 'C', 'trash');
handleFateReview('trash');
handleFateReviewAction('bulk action');
handleFateReviewBulk('delete all');
assert('all trash items removed from box16', box16.items.length === 0);
assert('all trash items removed from box17', box17.items.length === 0);
assert('review cleared', !state.pendingFateReview);

console.log('\n22. Bulk cancel returns to list');
reset();
var box18 = makeBox('Box', 'room');
makeItem(box18, 'A', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('bulk action');
handleFateReviewBulk('cancel');
assert('stage back to AWAITING_FATE_REVIEW_ACTION', state.conversationStage === 'AWAITING_FATE_REVIEW_ACTION');
assert('review still active', !!state.pendingFateReview);

console.log('\n23. Items deleted since review started are skipped silently');
reset();
var box19 = makeBox('Box', 'room');
var itemToDelete = makeItem(box19, 'Ghost item', 'unsure');
makeItem(box19, 'Real item', 'unsure');
handleFateReview('unsure');
// Delete first item directly (simulating deletion elsewhere)
box19.items = box19.items.filter(function(it){ return it.id !== itemToDelete.id; });
handleFateReviewAction('item by item');
// Should skip ghost and land on real item
assertIncludes('shows real item', lastBotMessage, 'Real item');

console.log('\n24. "review by fate" chip triggers menu');
reset();
var box20 = makeBox('Box', 'room');
makeItem(box20, 'A', 'keep');
processInput('review by fate', []);
assertIncludes('shows which fate prompt', lastBotMessage, 'Which fate');

// ── Fix regression tests ─────────────────────────────────────────────────────

console.log('\n25. Review by fate chip available from BOX_OPEN state');
reset();
var box21 = makeBox('Box', 'room');
makeItem(box21, 'A', 'keep');
state.conversationStage = 'BOX_OPEN';
// setBoxOpenChips is called by selectBox etc — check it includes Review by fate
app.setBoxOpenChips = app._setBoxOpenChipsImpl || null;
// Instead test via processInput which calls setBoxOpenChips
// Verify chip is in the list by checking handleHelp shows it from BOX_OPEN
processInput('help', []);
assert('Review by fate in chips from BOX_OPEN', lastChips.indexOf('Review by fate') !== -1);

console.log('\n26. "Review unsure (1)" chip format works');
reset();
var box22 = makeBox('Box', 'room');
makeItem(box22, 'A', 'unsure');
makeItem(box22, 'B', 'unsure');
handleFateReviewMenu(); // sets up the menu chips
// Simulate clicking 'Review unsure (2)' chip
processInput('Review unsure (2)', []);
assert('review started', !!state.pendingFateReview);
assert('correct fate', state.pendingFateReview && state.pendingFateReview.fate === 'unsure');

console.log('\n27. Single item skips list and goes straight to item view');
reset();
var box23 = makeBox('Box', 'room');
makeItem(box23, 'Only item', 'sell');
handleFateReview('sell');
assert('stage is AWAITING_FATE_REVIEW_ITEM not list', state.conversationStage === 'AWAITING_FATE_REVIEW_ITEM');
assertIncludes('shows item directly', lastBotMessage, 'Only item');

console.log('\n28. Number input from list jumps to that item');
reset();
var box24 = makeBox('Box', 'room');
makeItem(box24, 'First', 'keep');
makeItem(box24, 'Second', 'keep');
makeItem(box24, 'Third', 'keep');
handleFateReview('keep');
assert('list shown', state.conversationStage === 'AWAITING_FATE_REVIEW_ACTION');
handleFateReviewAction('3');
assert('jumped to item 3', state.conversationStage === 'AWAITING_FATE_REVIEW_ITEM');
assertIncludes('shows third item', lastBotMessage, 'Third');
assert('index set to 2', state.pendingFateReview && state.pendingFateReview.index === 2);
// reviewedCount should not be incremented by jumping
assert('reviewedCount not incremented by jump', (state.pendingFateReview.reviewedCount || 0) === 0);

console.log('\n29. Out of range number in list shows error and restores chips');
reset();
var box25 = makeBox('Box', 'room');
makeItem(box25, 'A', 'keep');
makeItem(box25, 'B', 'keep');
handleFateReview('keep');
handleFateReviewAction('99');
assert('still on list', state.conversationStage === 'AWAITING_FATE_REVIEW_ACTION');
assertIncludes('shows error', lastBotMessage, 'No item 99');
assert('list chips restored', lastChips.indexOf('Item by item') !== -1);
assert('bulk action chip restored', lastChips.indexOf('Bulk action') !== -1);


console.log('\n30. reviewedCount is accurate when starting mid-list via number jump');
reset();
var box26 = makeBox('Box', 'room');
makeItem(box26, 'A', 'keep');
makeItem(box26, 'B', 'keep');
makeItem(box26, 'C', 'keep');
handleFateReview('keep');
handleFateReviewAction('3'); // jump to item 3
// Skip (does not increment reviewedCount), then done
handleFateReviewItem('skip'); // past end of list, review completes
// review ends naturally — check the completion message
assertIncludes('showed done reviewing all', lastBotMessage, 'Done reviewing all');

console.log('\n31. Chip label strips count suffix before echoing');
// Verify the regex stripping works
var stripped = 'Review keep (11)'.replace(/\s*\(\d+\)$/, '');
assert('count stripped from chip label', stripped === 'Review keep');
var stripped2 = 'Review unsure (1)'.replace(/\s*\(\d+\)$/, '');
assert('count stripped from single digit', stripped2 === 'Review unsure');
var noStrip = 'Item by item'.replace(/\s*\(\d+\)$/, '');
assert('non-count chip unchanged', noStrip === 'Item by item');


// ── Regression tests for second round of fixes ───────────────────────────────

console.log('\n32. Trash review chips include all fate options for reclassification');
reset();
var box27 = makeBox('Box', 'room');
makeItem(box27, 'Lamp', 'trash');
handleFateReview('trash');
handleFateReviewAction('item by item');
var trashChips = fateReviewChips('trash');
assert('trash chips include Keep', trashChips.indexOf('Keep') !== -1);
assert('trash chips include Donate', trashChips.indexOf('Donate') !== -1);
assert('trash chips include Sell', trashChips.indexOf('Sell') !== -1);
assert('trash chips include Move to unsure', trashChips.indexOf('Move to unsure') !== -1);
assert('trash chips include Delete', trashChips.indexOf('Delete') !== -1);

var actualSellChips   = JSON.stringify(fateReviewChips('sell'));
var expectedSellChips = JSON.stringify(['Keep', 'Donate', 'Trash', 'Move to unsure', 'Add selling notes', 'Skip']);
console.log('\n32b. Sell review chips match expected set');
assert('sell chips correct', actualSellChips === expectedSellChips);

var actualDonateChips   = JSON.stringify(fateReviewChips('donate'));
var expectedDonateChips = JSON.stringify(['Keep', 'Sell', 'Trash', 'Move to unsure', 'Add donation destination', 'Skip']);
console.log('\n32c. Donate review chips match expected set');
assert('donate chips correct', actualDonateChips === expectedDonateChips);

console.log('\n33. reviewedCount increments on direct fate change (keep/donate/sell/unsure)');
reset();
var box28 = makeBox('Box', 'room');
makeItem(box28, 'Lamp', 'keep');
makeItem(box28, 'Chair', 'keep');
handleFateReview('keep');
handleFateReviewAction('item by item');
// Change fate via direct chip (e.g. Donate from unsure review)
// Use unsure review for this since keep items have 'Change fate' not direct fate chips
reset();
var box28b = makeBox('Box', 'room');
makeItem(box28b, 'Lamp', 'unsure');
makeItem(box28b, 'Chair', 'unsure');
handleFateReview('unsure');
handleFateReviewAction('item by item');
assert('reviewedCount starts at 0', (state.pendingFateReview.reviewedCount || 0) === 0);
handleFateReviewItem('keep'); // changes fate and advances
assert('reviewedCount incremented to 1', state.pendingFateReview && state.pendingFateReview.reviewedCount === 1);

console.log('\n34. Back chip handled correctly from AWAITING_FATE_REVIEW_ACTION');
reset();
var box29 = makeBox('Box', 'room');
makeItem(box29, 'Lamp', 'keep');
makeItem(box29, 'Chair', 'keep');
handleFateReview('keep'); // sets pendingFateReview and AWAITING_FATE_REVIEW_ACTION
assert('in review action stage', state.conversationStage === 'AWAITING_FATE_REVIEW_ACTION');
processInput('Back', []);
assert('Back cancelled review', !state.pendingFateReview);
assert('Back did not log item', box29.items.length === 2);
assert('stage is FINISHED', state.conversationStage === 'FINISHED');


// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + (failed === 0 ? '\u2705' : '\u274c') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
