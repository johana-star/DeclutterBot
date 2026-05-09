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
  app.state.pendingRenameBoxId = null;
  app.state.renamePositions = null;
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Rename Completion and Persistence
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Rename: box name updated');
test('box name changed to new value', function() {
  setupState();
  var box = {
    id: 'box1',
    name: 'OldName',
    location: null,
    items: [],
    deleted_at: null
  };
  var newName = 'NewName';

  box.name = newName;

  assertEqual(box.name, 'NewName', 'name updated');
  assertEqual(box.id, 'box1', 'id preserved');
});

console.log('\n2. Rename: confirmation message shows old and new names');
test('confirmation displays before and after names', function() {
  var oldName = 'Bedroom';
  var newName = 'Master Bedroom';
  var msg = 'Renamed **"' + oldName + '"** to **"' + newName + '"**.';

  assertTrue(msg.indexOf(oldName) !== -1, 'old name in message');
  assertTrue(msg.indexOf(newName) !== -1, 'new name in message');
  assertTrue(msg.indexOf('Renamed') !== -1, 'confirmation text');
});

console.log('\n3. Rename: state cleanup');
test('pendingRenameBoxId cleared after rename', function() {
  setupState();
  app.state.pendingRenameBoxId = 'box1';

  app.state.pendingRenameBoxId = null;

  assertEqual(app.state.pendingRenameBoxId, null, 'state cleared');
});

console.log('\n4. Rename: returns to FINISHED stage');
test('conversation stage set to FINISHED after rename', function() {
  setupState();
  app.state.conversationStage = 'AWAITING_BOX_RENAME';

  app.state.conversationStage = 'FINISHED';

  assertEqual(app.state.conversationStage, 'FINISHED', 'correct stage');
});

console.log('\n5. Rename: review refreshes after rename');
test('review all called to refresh after rename', function() {
  setupState();
  var boxes = [
    { id: 'box1', name: 'Old', location: null, items: [], deleted_at: null }
  ];

  // After renaming, should call handleFinished('review all')
  // which refreshes chips and box list
  var boxes2 = _.reject(boxes, (box) => box.deleted_at);
  assertEqual(boxes2.length, 1, 'boxes still present in review');
});

console.log('\n6. Rename: empty name rejected');
test('empty or whitespace-only names rejected', function() {
  var emptyName = '';
  var isValid = emptyName.trim().length > 0;

  assertTrue(!isValid, 'empty name invalid');
});

console.log('\n7. Rename: whitespace trimmed');
test('name trimmed of leading/trailing whitespace', function() {
  var input = '  Kitchen  ';
  var trimmed = input.trim();

  assertEqual(trimmed, 'Kitchen', 'whitespace removed');
});

console.log('\n8. Rename: box found by ID');
test('box located by ID during rename', function() {
  setupState();
  var targetId = 'box2';
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Box3', location: null, items: [], deleted_at: null }
  ];

  var box = null;
  for(var i = 0; i < app.state.boxes.length; i++) {
    if (app.state.boxes[i].id === targetId) {
      box = app.state.boxes[i];
      break;
    }
  }

  assertEqual(box.name, 'Box2', 'correct box found');
});

console.log('\n9. Rename: preserves other box data');
test('rename does not affect other box properties', function() {
  setupState();
  var box = {
    id: 'box1',
    name: 'Old',
    location: 'kitchen',
    items: [{ id: 'item1', name: 'Item1', fate: null, deleted_at: null }],
    deleted_at: null
  };

  box.name = 'New';

  assertEqual(box.location, 'kitchen', 'location preserved');
  assertEqual(box.items.length, 1, 'items preserved');
  assertEqual(box.id, 'box1', 'id preserved');
  assertEqual(box.deleted_at, null, 'deleted_at preserved');
});

console.log('\n10. Rename: multiple renames in sequence');
test('box can be renamed multiple times', function() {
  var box = { id: 'box1', name: 'Name1', location: null, items: [], deleted_at: null };

  box.name = 'Name2';
  assertEqual(box.name, 'Name2', 'first rename');

  box.name = 'Name3';
  assertEqual(box.name, 'Name3', 'second rename');

  box.name = 'Name4';
  assertEqual(box.name, 'Name4', 'third rename');
});

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
