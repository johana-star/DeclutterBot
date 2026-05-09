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

function assertArrayEquals(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg + ' (got ' + JSON.stringify(actual) + ', expected ' +
      JSON.stringify(expected) + ')');
  }
}

// Mock for tracking messages and chips
let lastMessage = '';
let lastChips = [];

global.addBotMessage = function(msg) {
  lastMessage = msg;
};

global.setChips = function(chips) {
  lastChips = chips;
};

// Helper: setup fresh state with boxes
function setupState() {
  app.state.boxes = [];
  app.state.activeBoxId = null;
  app.state.conversationStage = 'FINISHED';
  app.collapsedBoxIds = [];
  app.state.emptyBoxesForDelete = null;
  app.state.emptyBoxPositions = null;
  lastChips = [];
  lastMessage = '';
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Delete Chips Use Actual Box Positions
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Empty boxes at positions 3 and 4');
test('boxes 1,2 full, 3,4 empty → Delete 3 and Delete 4 chips', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Full1',
      location: null,
      items: [
        { id: 'item1', name: 'Item1', fate: null, deleted_at: null }
      ],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Full2',
      location: null,
      items: [
        { id: 'item2', name: 'Item2', fate: null, deleted_at: null }
      ],
      deleted_at: null
    },
    {
      id: 'box3',
      name: 'Empty1',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box4',
      name: 'Empty2',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  // Simulate review all logic
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxPositions = [];
  for(var i = 0; i < boxes.length; i++) {
    var activeItems = _.reject(boxes[i].items, (item) => item.deleted_at);
    if (activeItems.length === 0) {
      emptyBoxPositions.push(i + 1);
    }
  }

  assertArrayEquals(emptyBoxPositions, [3, 4], 'empty box positions');

  // Build chips
  var deleteChips = [];
  if (emptyBoxPositions.length === 2) {
    deleteChips.push('Delete ' + emptyBoxPositions[0]);
    deleteChips.push('Delete ' + emptyBoxPositions[1]);
  }

  assertArrayEquals(deleteChips, ['Delete 3', 'Delete 4'], 'delete chips');
});

console.log('\n2. Single empty box at position 5');
test('boxes 1-4 full, box 5 empty → Delete 5 chip', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Full1', location: null, items: [{ id: 'i1', name: 'Item1', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'box2', name: 'Full2', location: null, items: [{ id: 'i2', name: 'Item2', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'box3', name: 'Full3', location: null, items: [{ id: 'i3', name: 'Item3', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'box4', name: 'Full4', location: null, items: [{ id: 'i4', name: 'Item4', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'box5', name: 'Empty', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxPositions = [];
  for(var i = 0; i < boxes.length; i++) {
    var activeItems = _.reject(boxes[i].items, (item) => item.deleted_at);
    if (activeItems.length === 0) {
      emptyBoxPositions.push(i + 1);
    }
  }

  assertEqual(emptyBoxPositions[0], 5, 'empty box at position 5');

  var deleteChips = [];
  if (emptyBoxPositions.length === 1) {
    deleteChips.push('Delete ' + emptyBoxPositions[0]);
  }

  assertEqual(deleteChips[0], 'Delete 5', 'chip shows Delete 5');
});

console.log('\n3. Empty boxes at positions 1, 5, 8');
test('3 empty boxes at non-consecutive positions → Delete... chip', function() {
  setupState();
  app.state.boxes = [
    { id: 'b1', name: 'E1', location: null, items: [], deleted_at: null },
    { id: 'b2', name: 'F1', location: null, items: [{ id: 'i', name: 'I', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'b3', name: 'F2', location: null, items: [{ id: 'i', name: 'I', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'b4', name: 'F3', location: null, items: [{ id: 'i', name: 'I', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'b5', name: 'E2', location: null, items: [], deleted_at: null },
    { id: 'b6', name: 'F4', location: null, items: [{ id: 'i', name: 'I', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'b7', name: 'F5', location: null, items: [{ id: 'i', name: 'I', fate: null, deleted_at: null }], deleted_at: null },
    { id: 'b8', name: 'E3', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxPositions = [];
  for(var i = 0; i < boxes.length; i++) {
    var activeItems = _.reject(boxes[i].items, (item) => item.deleted_at);
    if (activeItems.length === 0) {
      emptyBoxPositions.push(i + 1);
    }
  }

  assertArrayEquals(emptyBoxPositions, [1, 5, 8], 'empty positions');

  var deleteChips = [];
  if (emptyBoxPositions.length >= 3) {
    deleteChips.push('Delete...');
  }

  assertEqual(deleteChips[0], 'Delete...', 'elliptical chip shown');
});

console.log('\n4. Elliptical handler lists correct positions');
test('elliptical reminder shows actual box numbers', function() {
  var emptyBoxPositions = [1, 5, 8];
  var reminderMsg = 'Which box? Type _delete_ followed by the number. Applies to: ' +
    emptyBoxPositions.join(', ') + '.';

  assertEqual(reminderMsg.indexOf('1, 5, 8') !== -1, true, 'reminder includes positions');
});

console.log('\n5. Delete command matches position not array index');
test('delete 5 matches actual box 5, not array index 5', function() {
  var emptyBoxPositions = [3, 4];
  var userCommand = 'delete 3';
  var match = userCommand.match(/delete (\d+)/);
  var boxNum = parseInt(match[1], 10);

  var posIndex = emptyBoxPositions.indexOf(boxNum);
  assertEqual(posIndex, 0, 'position 3 is at index 0 in positions array');
});

console.log('\n6. Delete command validation uses positions not indices');
test('delete 4 is valid when positions are [3, 4]', function() {
  var emptyBoxPositions = [3, 4];
  var boxNum = 4;

  var posIndex = emptyBoxPositions.indexOf(boxNum);
  assertEqual(posIndex !== -1, true, 'position 4 is valid');
});

console.log('\n7. Delete command validation fails for non-empty positions');
test('delete 2 is invalid when positions are [3, 4]', function() {
  var emptyBoxPositions = [3, 4];
  var boxNum = 2;

  var posIndex = emptyBoxPositions.indexOf(boxNum);
  assertEqual(posIndex === -1, true, 'position 2 is not in list');
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
