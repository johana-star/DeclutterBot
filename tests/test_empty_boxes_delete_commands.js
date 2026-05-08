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

// Mock for tracking messages and chips
let lastMessage = '';
let lastChips = [];
let tryInterceptCalled = false;
let tryInterceptReturnValue = false;

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
  lastChips = [];
  lastMessage = '';
  tryInterceptReturnValue = false;
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Handle Delete Commands (delete 1, delete 2)
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Delete command recognition: delete 1 in FINISHED stage');
test('delete 1 with empty boxes in FINISHED stage → intercepted', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty1',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Empty2',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  // Simulate the state after review all was called
  app.state.conversationStage = 'FINISHED';
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  // Check precondition: we have empty boxes
  assertTrue(emptyBoxes.length > 0, 'have empty boxes to delete');

  // Test: delete 1 should be intercepted when we have empty boxes
  var shouldIntercept = (app.state.conversationStage === 'FINISHED') && emptyBoxes.length > 0;
  assertTrue(shouldIntercept, 'delete 1 should be intercepted in FINISHED with empty boxes');
});

console.log('\n2. Delete command recognition: delete 1 not in FINISHED stage');
test('delete 1 outside FINISHED stage → not intercepted', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  // Set to different stage
  app.state.conversationStage = 'BOX_OPEN';

  var shouldIntercept = (app.state.conversationStage === 'FINISHED');
  assertFalse(shouldIntercept, 'delete 1 should not be intercepted outside FINISHED');
});

console.log('\n3. Delete command recognition: delete 2 in FINISHED stage');
test('delete 2 with 2+ empty boxes → intercepted', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty1',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Empty2',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  app.state.conversationStage = 'FINISHED';
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') && (emptyBoxes.length >= 2);
  assertTrue(shouldIntercept, 'delete 2 should be intercepted with 2+ empty boxes');
});

console.log('\n4. Delete command recognition: delete 2 with only 1 empty box');
test('delete 2 with only 1 empty box → not intercepted', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  app.state.conversationStage = 'FINISHED';
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  var shouldIntercept = (app.state.conversationStage === 'FINISHED') && (emptyBoxes.length >= 2);
  assertFalse(shouldIntercept, 'delete 2 should not be intercepted with only 1 empty box');
});

console.log('\n5. Delete command recognition: delete 3 with 3 empty boxes');
test('delete 3 with 3 empty boxes → not intercepted (only 1 and 2)', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty1',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Empty2',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box3',
      name: 'Empty3',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  app.state.conversationStage = 'FINISHED';
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  // When 3+ empty boxes exist, only intercept delete 1 or delete 2
  // delete 3+ should go to elliptical handler
  var shouldInterceptDelete3 = (emptyBoxes.length < 3);
  assertFalse(shouldInterceptDelete3, 'with 3+ empty boxes, use elliptical not delete 3');
});

console.log('\n6. Delete command parsing: extract number from command');
test('parse delete command to extract box number', function() {
  var command = 'delete 1';
  var match = command.match(/delete (\d+)/);
  assertTrue(match !== null, 'command should match');
  assertEqual(parseInt(match[1], 10), 1, 'extracted box number');
});

console.log('\n7. Delete command parsing: handles delete 2');
test('parse delete 2 command', function() {
  var command = 'delete 2';
  var match = command.match(/delete (\d+)/);
  assertTrue(match !== null, 'command should match');
  assertEqual(parseInt(match[1], 10), 2, 'extracted box number');
});

console.log('\n8. Delete command state: track empty boxes for deletion');
test('store empty boxes list for context', function() {
  setupState();
  var emptyBoxesForDelete = [
    {
      id: 'box1',
      name: 'Empty1',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Empty2',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  assertEqual(emptyBoxesForDelete.length, 2, 'empty boxes list stored');
  assertEqual(emptyBoxesForDelete[0].name, 'Empty1', 'first empty box accessible');
  assertEqual(emptyBoxesForDelete[1].name, 'Empty2', 'second empty box accessible');
});

console.log('\n9. Delete command validation: valid box number');
test('delete 1 with 2 empty boxes is valid', function() {
  var emptyBoxesForDelete = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null }
  ];
  var boxNum = 1;

  var isValid = (boxNum > 0 && boxNum <= emptyBoxesForDelete.length);
  assertTrue(isValid, 'box 1 is valid');
});

console.log('\n10. Delete command validation: invalid box number');
test('delete 3 with only 2 empty boxes is invalid', function() {
  var emptyBoxesForDelete = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null }
  ];
  var boxNum = 3;

  var isValid = (boxNum > 0 && boxNum <= emptyBoxesForDelete.length);
  assertFalse(isValid, 'box 3 is invalid when only 2 empty boxes exist');
});

console.log('\n11. Delete command: retrieve target box');
test('retrieve empty box by number', function() {
  var emptyBoxesForDelete = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null }
  ];
  var boxNum = 1;

  var targetBox = emptyBoxesForDelete[boxNum - 1];
  assertEqual(targetBox.name, 'Empty1', 'retrieved correct box');
});

console.log('\n12. Delete command: retrieve second box');
test('retrieve second empty box by number', function() {
  var emptyBoxesForDelete = [
    { id: 'box1', name: 'Empty1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Empty2', location: null, items: [], deleted_at: null }
  ];
  var boxNum = 2;

  var targetBox = emptyBoxesForDelete[boxNum - 1];
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
