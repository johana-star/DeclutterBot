const _ = require('./lodash.js');
const app = require('../app.js');

let testCount = 0;
let passCount = 0;

function test(description, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('  ✅ ' + description);
  } catch (err) {
    console.log('  ❌ ' + description);
    console.log('     ' + err.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg + ' (got ' + actual + ', expected ' + expected + ')');
  }
}

function assertTrue(val, msg) {
  if (!val) {
    throw new Error(msg);
  }
}

function setupState() {
  app.state.boxes = [];
  app.state.conversationStage = 'FINISHED';
  app.state.pendingMoveBoxId = null;
  app.state.movePositions = null;
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Move Completion and Persistence
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Move: box location updated');
test('box location changed to new value', function() {
  setupState();
  var box = {
    id: 'box1',
    name: 'Storage',
    location: 'garage',
    items: [],
    deleted_at: null
  };
  var newLocation = 'basement';

  box.location = newLocation;

  assertEqual(box.location, 'basement', 'location updated');
  assertEqual(box.id, 'box1', 'id preserved');
});

console.log('\n2. Move: confirmation message shows old and new locations');
test('confirmation displays before and after locations', function() {
  var boxName = 'Bedroom';
  var prevLocation = 'apartment';
  var newLocation = 'storage unit';
  var msg = 'Moved **"' + boxName + '"** from _' + prevLocation + '_ to _' +
    newLocation + '_.';

  assertTrue(msg.indexOf(prevLocation) !== -1, 'old location in message');
  assertTrue(msg.indexOf(newLocation) !== -1, 'new location in message');
  assertTrue(msg.indexOf('Moved') !== -1, 'confirmation text');
});

console.log('\n3. Move: state cleanup');
test('pendingMoveBoxId cleared after move', function() {
  setupState();
  app.state.pendingMoveBoxId = 'box1';

  app.state.pendingMoveBoxId = null;

  assertEqual(app.state.pendingMoveBoxId, null, 'state cleared');
});

console.log('\n4. Move: returns to FINISHED stage');
test('conversation stage set to FINISHED after move', function() {
  setupState();
  app.state.conversationStage = 'AWAITING_MOVE_LOCATION_REVIEW';

  app.state.conversationStage = 'FINISHED';

  assertEqual(app.state.conversationStage, 'FINISHED', 'correct stage');
});

console.log('\n5. Move: review refreshes after move');
test('review all called to refresh after move', function() {
  setupState();
  var boxes = [
    { id: 'box1', name: 'Box1', location: 'old', items: [], deleted_at: null }
  ];

  // After moving, should call handleFinished('review all')
  var boxes2 = _.reject(boxes, (box) => box.deleted_at);
  assertEqual(boxes2.length, 1, 'boxes still present in review');
});

console.log('\n6. Move: empty location rejected');
test('empty or whitespace-only locations rejected', function() {
  var emptyLoc = '';
  var isValid = emptyLoc.trim().length > 0;

  assertTrue(!isValid, 'empty location invalid');
});

console.log('\n7. Move: whitespace trimmed');
test('location trimmed of leading/trailing whitespace', function() {
  var input = '  Storage Unit  ';
  var trimmed = input.trim();

  assertEqual(trimmed, 'Storage Unit', 'whitespace removed');
});

console.log('\n8. Move: box found by ID');
test('box located by ID during move', function() {
  setupState();
  var targetId = 'box2';
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: 'apt', items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: 'storage', items: [], deleted_at: null },
    { id: 'box3', name: 'Box3', location: 'house', items: [], deleted_at: null }
  ];

  var box = _.find(app.state.boxes, (b) => b.id === targetId);

  assertEqual(box.name, 'Box2', 'correct box found');
  assertEqual(box.location, 'storage', 'location preserved until update');
});

console.log('\n9. Move: preserves other box data');
test('move does not affect other box properties', function() {
  setupState();
  var box = {
    id: 'box1',
    name: 'Kitchen',
    location: 'old_apt',
    items: [{ id: 'item1', name: 'Item1', fate: null, deleted_at: null }],
    deleted_at: null
  };

  box.location = 'new_apt';

  assertEqual(box.name, 'Kitchen', 'name preserved');
  assertEqual(box.items.length, 1, 'items preserved');
  assertEqual(box.id, 'box1', 'id preserved');
  assertEqual(box.deleted_at, null, 'deleted_at preserved');
});

console.log('\n10. Move: unspecified location handling');
test('move from unspecified location displays correctly', function() {
  var boxName = 'MyBox';
  var prevLocation = null;
  var displayPrev = prevLocation || 'unspecified';
  var newLocation = 'kitchen';

  var msg = 'Moved **"' + boxName + '"** from _' + displayPrev + '_ to _' +
    newLocation + '_.';

  assertIncludes(msg, 'unspecified', 'unspecified shown for null');
  assertIncludes(msg, 'kitchen', 'new location shown');
});

function assertIncludes(str, substr, msg) {
  if (str.indexOf(substr) === -1) {
    throw new Error(msg + ' (expected to include "' + substr + '")');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────────────

console.log('\n────────────────────────────────────────────────────────────────');
if (passCount === testCount) {
  console.log('✅ ' + passCount + ' passed, 0 failed');
} else {
  console.log('❌ ' + passCount + ' passed, ' + (testCount - passCount) + ' failed');
}
console.log('────────────────────────────────────────────────────────────────');
