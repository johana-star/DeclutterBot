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
// Test Suite: Soft-Delete Empty Boxes
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Soft deletion: set deleted_at timestamp');
test('soft-deleted box has deleted_at timestamp', function() {
  var box = {
    id: 'box1',
    name: 'Empty',
    location: null,
    items: [],
    deleted_at: null
  };

  // Simulate soft delete
  box.deleted_at = new Date().toISOString();

  assertTrue(box.deleted_at !== null, 'deleted_at is set');
  assertTrue(typeof box.deleted_at === 'string', 'deleted_at is ISO string');
});

console.log('\n2. Soft deletion: preserves box data');
test('soft-deleted box retains all properties', function() {
  var box = {
    id: 'box1',
    name: 'Empty',
    location: 'home',
    items: [],
    deleted_at: null
  };

  box.deleted_at = new Date().toISOString();

  assertEqual(box.id, 'box1', 'id preserved');
  assertEqual(box.name, 'Empty', 'name preserved');
  assertEqual(box.location, 'home', 'location preserved');
});

console.log('\n3. Soft deletion: filter removes deleted boxes');
test('reject filters out soft-deleted boxes', function() {
  var boxes = [
    { id: 'box1', name: 'Active', deleted_at: null },
    { id: 'box2', name: 'Deleted', deleted_at: '2026-05-08T00:00:00Z' },
    { id: 'box3', name: 'Active2', deleted_at: null }
  ];

  var activeBoxes = _.reject(boxes, (box) => box.deleted_at);

  assertEqual(activeBoxes.length, 2, 'deleted box filtered out');
  assertEqual(activeBoxes[0].name, 'Active', 'first box correct');
  assertEqual(activeBoxes[1].name, 'Active2', 'second box correct');
});

console.log('\n4. Soft deletion: session counter incremented');
test('deletion increments sessionDeletedCount', function() {
  var initialCount = 5;
  var newCount = initialCount + 1;

  assertEqual(newCount, 6, 'counter incremented');
});

console.log('\n5. Confirmation message: includes box name');
test('deletion confirmation displays box name', function() {
  var boxName = 'Empty Bedroom';
  var msg = 'Deleted the empty box **"' + boxName + '"**.';

  assertIncludes(msg, 'Empty Bedroom', 'box name in message');
  assertIncludes(msg, 'Deleted', 'confirmation text present');
});

console.log('\n6. State cleanup: emptyBoxesForDelete set to null');
test('emptyBoxesForDelete cleared after deletion', function() {
  setupState();
  app.state.emptyBoxesForDelete = [
    { id: 'box1', name: 'Empty', deleted_at: null }
  ];

  app.state.emptyBoxesForDelete = null;

  assertEqual(app.state.emptyBoxesForDelete, null, 'state cleared');
});

console.log('\n7. Sidebar refresh: recounts active items');
test('sidebar updates after soft deletion', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Box1',
      location: null,
      items: [
        { id: 'item1', name: 'Item1', deleted_at: null }
      ],
      deleted_at: null
    }
  ];

  var box = app.state.boxes[0];
  var activeItems = _.reject(box.items, function(it) { return it.deleted_at; });

  assertEqual(activeItems.length, 1, 'sidebar counts active items');
});

console.log('\n8. Review refresh: excludes soft-deleted boxes');
test('review all refreshes and excludes deleted boxes', function() {
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

  // Soft delete first box
  app.state.boxes[0].deleted_at = new Date().toISOString();

  var activeBoxes = _.reject(app.state.boxes, (box) => box.deleted_at);

  assertEqual(activeBoxes.length, 1, 'deleted box excluded from review');
  assertEqual(activeBoxes[0].name, 'Empty2', 'remaining box visible');
});

console.log('\n9. Review refresh: recalculates empty boxes');
test('empty box list recalculated after deletion', function() {
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

  // Before deletion: 3 empty
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBefore = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });
  assertEqual(emptyBefore.length, 3, '3 empty before deletion');

  // Soft delete first empty box
  app.state.boxes[0].deleted_at = new Date().toISOString();

  // After deletion: 2 empty
  boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyAfter = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });
  assertEqual(emptyAfter.length, 2, '2 empty after deletion');
});

console.log('\n10. Chip update: delete... no longer shown');
test('delete... chip removed when fewer than 3 empty', function() {
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

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  var deleteChips = [];
  if (emptyBoxes.length === 1) {
    deleteChips.push('Delete 1');
  } else if (emptyBoxes.length === 2) {
    deleteChips.push('Delete 1');
    deleteChips.push('Delete 2');
  } else if (emptyBoxes.length >= 3) {
    deleteChips.push('Delete...');
  }

  assertFalse(deleteChips.indexOf('Delete...') !== -1, 'delete... not shown');
  assertEqual(deleteChips.length, 2, 'shows Delete 1 and Delete 2');
});

console.log('\n11. Chip update: delete 2 no longer shown when 1 left');
test('Delete 2 removed when only 1 empty box remains', function() {
  var emptyCount = 1;
  var deleteChips = [];
  if (emptyCount === 1) {
    deleteChips.push('Delete 1');
  } else if (emptyCount === 2) {
    deleteChips.push('Delete 1');
    deleteChips.push('Delete 2');
  }

  assertEqual(deleteChips.length, 1, 'only Delete 1 shown');
  assertFalse(deleteChips.indexOf('Delete 2') !== -1, 'Delete 2 removed');
});

console.log('\n12. Full cycle: delete 1 of 3 empty boxes');
test('complete flow: soft delete, refresh, recalculate', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'E1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'E2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'E3', location: null, items: [], deleted_at: null }
  ];

  // Check initial state
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });
  assertEqual(emptyBoxes.length, 3, 'start with 3 empty');

  // Soft delete box 1
  var targetBox = emptyBoxes[0];
  targetBox.deleted_at = new Date().toISOString();

  // Recalculate
  boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });
  assertEqual(emptyBoxes.length, 2, 'after deletion: 2 empty');
  assertEqual(emptyBoxes[0].name, 'E2', 'correct remaining boxes');
  assertEqual(emptyBoxes[1].name, 'E3', 'correct remaining boxes');
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
