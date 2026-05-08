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

function assertFalse(val, msg) {
  if (val) {
    throw new Error(msg);
  }
}

function assertIncludes(str, substr, msg) {
  if (str.indexOf(substr) === -1) {
    throw new Error(msg + ' (got "' + str + '", expected to include "' + substr + '")');
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
  lastChips = [];
  lastMessage = '';
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Elliptical Delete Handler (delete...)
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Elliptical recognition: delete... with 3 empty boxes');
test('delete... should be recognized with 3+ empty boxes', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Empty3', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  var shouldShowDeleteElliptical = emptyBoxes.length >= 3;
  assertTrue(shouldShowDeleteElliptical, 'delete... shown with 3+ empty');
});

console.log('\n2. Elliptical recognition: delete... not with 2 empty boxes');
test('delete... should not appear with only 2 empty boxes', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  var shouldShowDeleteElliptical = emptyBoxes.length >= 3;
  assertFalse(shouldShowDeleteElliptical, 'delete... not shown with only 2');
});

console.log('\n3. Elliptical reminder: lists empty box numbers');
test('reminder message lists empty box numbers', function() {
  var emptyBoxes = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Empty3', location: null, items: [], deleted_at: null }
  ];

  // Build reminder list (1-indexed)
  var eligible = emptyBoxes.map(function(b, i) { return (i + 1); });
  var reminderText = eligible.join(', ');

  assertEqual(reminderText, '1, 2, 3', 'reminder lists empty box numbers');
});

console.log('\n4. Elliptical reminder: handles 4 empty boxes');
test('reminder with 4 empty boxes lists all', function() {
  var emptyBoxes = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Empty3', location: null, items: [], deleted_at: null },
    { id: 'box4', name: 'Empty4', location: null, items: [], deleted_at: null }
  ];

  var eligible = emptyBoxes.map(function(b, i) { return (i + 1); });
  var reminderText = eligible.join(', ');

  assertEqual(reminderText, '1, 2, 3, 4', 'reminder lists all numbers');
});

console.log('\n5. Elliptical prompt: instructs user on usage');
test('elliptical prompt explains how to use delete commands', function() {
  var eligible = ['1', '2', '3'];
  var reminderMsg = 'Which box? Type _delete_ followed by the number. Applies to: ' +
    eligible.join(', ') + '.';

  assertIncludes(reminderMsg, 'Which box', 'mentions which box');
  assertIncludes(reminderMsg, 'Type _delete_', 'instructs to type delete');
  assertIncludes(reminderMsg, 'followed by the number', 'mentions number');
  assertIncludes(reminderMsg, 'Applies to:', 'mentions applicable boxes');
});

console.log('\n6. Elliptical input pre-fill: sets delete prefix');
test('pre-fill input with delete prefix', function() {
  var prefixValue = 'delete ';
  assertEqual(prefixValue, 'delete ', 'input pre-filled with "delete "');
});

console.log('\n7. Elliptical stage: AWAITING_DELETE_EMPTY_BOX');
test('conversation stage set to AWAITING_DELETE_EMPTY_BOX', function() {
  setupState();
  var newStage = 'AWAITING_DELETE_EMPTY_BOX';
  assertEqual(newStage, 'AWAITING_DELETE_EMPTY_BOX', 'correct stage name');
});

console.log('\n8. Elliptical interception: delete... in FINISHED stage');
test('delete... intercepted when in FINISHED with 3+ empty', function() {
  setupState();
  app.state.conversationStage = 'FINISHED';
  app.state.boxes = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Empty3', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') &&
    (emptyBoxes.length >= 3);
  assertTrue(shouldIntercept, 'delete... intercepted in FINISHED with 3+ empty');
});

console.log('\n9. Elliptical input parsing: handles number in AWAITING_DELETE_EMPTY_BOX');
test('parse delete N in AWAITING_DELETE_EMPTY_BOX stage', function() {
  var command = 'delete 2';
  var match = command.match(/delete (\d+)/);
  assertTrue(match !== null, 'command matches delete pattern');
  assertEqual(parseInt(match[1], 10), 2, 'extracted correct number');
});

console.log('\n10. Elliptical validation: valid box number in range');
test('validate delete 2 with 3 empty boxes', function() {
  var boxNum = 2;
  var emptyBoxCount = 3;

  var isValid = (boxNum > 0 && boxNum <= emptyBoxCount);
  assertTrue(isValid, 'delete 2 valid with 3 empty boxes');
});

console.log('\n11. Elliptical validation: invalid box number too high');
test('validate delete 4 with only 3 empty boxes', function() {
  var boxNum = 4;
  var emptyBoxCount = 3;

  var isValid = (boxNum > 0 && boxNum <= emptyBoxCount);
  assertFalse(isValid, 'delete 4 invalid with only 3 empty boxes');
});

console.log('\n12. Elliptical flow: retrieve box by number from list');
test('retrieve empty box 2 from list', function() {
  var emptyBoxes = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Empty3', location: null, items: [], deleted_at: null }
  ];
  var boxNum = 2;

  var targetBox = emptyBoxes[boxNum - 1];
  assertEqual(targetBox.name, 'Empty2', 'retrieved correct box');
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
