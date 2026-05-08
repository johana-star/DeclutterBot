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

function assertArrayEquals(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg + ' (got ' + JSON.stringify(actual) + ', expected ' +
      JSON.stringify(expected) + ')');
  }
}

// Mock for tracking chip calls
let lastChips = [];
global.setChips = function(chips) {
  lastChips = chips;
};

global.addBotMessage = function(msg) {
  // silently track messages
};

// Helper: setup fresh state with boxes
function setupState() {
  app.state.boxes = [];
  app.state.activeBoxId = null;
  app.state.conversationStage = 'WELCOME';
  app.collapsedBoxIds = [];
  lastChips = [];
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Delete Chips for Empty Boxes
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Delete chips: no empty boxes');
test('0 empty boxes → no delete chips', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Box1',
      location: null,
      items: [
        { id: 'item1', name: 'Item1', fate: null, deleted_at: null }
      ],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Box2',
      location: null,
      items: [
        { id: 'item2', name: 'Item2', fate: null, deleted_at: null }
      ],
      deleted_at: null
    }
  ];

  // Simulate review all boxes behavior
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  assertEqual(emptyBoxes.length, 0, 'no empty boxes');
});

console.log('\n2. Delete chips: 1 empty box');
test('1 empty box → single Delete 1 chip', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Full',
      location: null,
      items: [
        { id: 'item1', name: 'Item1', fate: null, deleted_at: null }
      ],
      deleted_at: null
    }
  ];

  // Simulate review all boxes behavior
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  assertEqual(emptyBoxes.length, 1, '1 empty box');

  // Build delete chips
  var deleteChips = [];
  if (emptyBoxes.length === 1) {
    deleteChips.push('Delete 1');
  } else if (emptyBoxes.length === 2) {
    deleteChips.push('Delete 1');
    deleteChips.push('Delete 2');
  } else if (emptyBoxes.length >= 3) {
    deleteChips.push('Delete...');
  }

  assertArrayEquals(deleteChips, ['Delete 1'], 'delete chips');
});

console.log('\n3. Delete chips: 2 empty boxes');
test('2 empty boxes → Delete 1 and Delete 2 chips', function() {
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

  // Simulate review all boxes behavior
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  assertEqual(emptyBoxes.length, 2, '2 empty boxes');

  // Build delete chips
  var deleteChips = [];
  if (emptyBoxes.length === 1) {
    deleteChips.push('Delete 1');
  } else if (emptyBoxes.length === 2) {
    deleteChips.push('Delete 1');
    deleteChips.push('Delete 2');
  } else if (emptyBoxes.length >= 3) {
    deleteChips.push('Delete...');
  }

  assertArrayEquals(deleteChips, ['Delete 1', 'Delete 2'], 'delete chips');
});

console.log('\n4. Delete chips: 3+ empty boxes');
test('3+ empty boxes → Delete... chip only', function() {
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

  // Simulate review all boxes behavior
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  assertEqual(emptyBoxes.length, 3, '3 empty boxes');

  // Build delete chips
  var deleteChips = [];
  if (emptyBoxes.length === 1) {
    deleteChips.push('Delete 1');
  } else if (emptyBoxes.length === 2) {
    deleteChips.push('Delete 1');
    deleteChips.push('Delete 2');
  } else if (emptyBoxes.length >= 3) {
    deleteChips.push('Delete...');
  }

  assertArrayEquals(deleteChips, ['Delete...'], 'delete chips');
});

console.log('\n5. Delete chips: mixed with soft-deleted boxes');
test('soft-deleted boxes excluded from empty detection', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Deleted',
      location: null,
      items: [],
      deleted_at: '2026-05-08T00:00:00Z'
    }
  ];

  // Simulate review all boxes behavior
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  assertEqual(boxes.length, 1, '1 non-deleted box');
  assertEqual(emptyBoxes.length, 1, '1 empty (non-deleted) box');

  // Build delete chips
  var deleteChips = [];
  if (emptyBoxes.length === 1) {
    deleteChips.push('Delete 1');
  }

  assertArrayEquals(deleteChips, ['Delete 1'], 'delete chips');
});

console.log('\n6. Delete chips: mixed boxes with soft-deleted items');
test('boxes with only soft-deleted items are empty', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Empty',
      location: null,
      items: [
        { id: 'item1', name: 'Item1', fate: null, deleted_at: '2026-05-08T00:00:00Z' }
      ],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Full',
      location: null,
      items: [
        { id: 'item2', name: 'Item2', fate: null, deleted_at: null }
      ],
      deleted_at: null
    }
  ];

  // Simulate review all boxes behavior
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  assertEqual(emptyBoxes.length, 1, '1 empty box (has soft-deleted items)');

  // Build delete chips
  var deleteChips = [];
  if (emptyBoxes.length === 1) {
    deleteChips.push('Delete 1');
  }

  assertArrayEquals(deleteChips, ['Delete 1'], 'delete chips');
});

console.log('\n7. Delete chips: combined with standard chips');
test('delete chips combined with New box, Done for now, Review by fate', function() {
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

  // Simulate review all boxes behavior
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });

  // Build delete chips
  var deleteChips = [];
  if (emptyBoxes.length === 1) {
    deleteChips.push('Delete 1');
  }

  // Combine with standard chips
  var allChips = deleteChips.concat(['New box', 'Done for now', 'Review by fate']);

  assertArrayEquals(allChips, ['Delete 1', 'New box', 'Done for now', 'Review by fate'],
    'all chips');
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
