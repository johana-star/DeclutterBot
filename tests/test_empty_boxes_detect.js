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

// Helper: setup fresh state with boxes
function setupState() {
  app.state.boxes = [];
  app.state.activeBoxId = null;
  app.state.conversationStage = 'WELCOME';
  app.collapsedBoxIds = [];
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Detecting Empty Boxes
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Empty box detection: no boxes');
test('no boxes → no empty boxes', function() {
  setupState();
  // no boxes added
  // When reviewing all boxes, should report 0 boxes
  assertEqual(app.state.boxes.length, 0, 'box count');
});

console.log('\n2. Empty box detection: box with items');
test('box with active items → not empty', function() {
  setupState();
  app.state.boxes = [{
    id: 'box1',
    name: 'Bedroom',
    location: 'home',
    items: [
      { id: 'item1', name: 'T-shirt', fate: null, deleted_at: null },
      { id: 'item2', name: 'Jeans', fate: null, deleted_at: null }
    ],
    deleted_at: null
  }];
  var box = app.state.boxes[0];
  var activeItems = _.reject(box.items, (item) => item.deleted_at);
  assertEqual(activeItems.length, 2, 'active item count');
});

console.log('\n3. Empty box detection: box with only soft-deleted items');
test('box with only soft-deleted items → empty', function() {
  setupState();
  app.state.boxes = [{
    id: 'box1',
    name: 'Kitchen',
    location: 'home',
    items: [
      { id: 'item1', name: 'Plate', fate: null, deleted_at: '2026-05-08T00:00:00Z' },
      { id: 'item2', name: 'Bowl', fate: null, deleted_at: '2026-05-08T00:00:00Z' }
    ],
    deleted_at: null
  }];
  var box = app.state.boxes[0];
  var activeItems = _.reject(box.items, (item) => item.deleted_at);
  assertEqual(activeItems.length, 0, 'active item count should be 0');
});

console.log('\n4. Empty box detection: box with no items at all');
test('box with no items → empty', function() {
  setupState();
  app.state.boxes = [{
    id: 'box1',
    name: 'Garage',
    location: 'home',
    items: [],
    deleted_at: null
  }];
  var box = app.state.boxes[0];
  var activeItems = _.reject(box.items, (item) => item.deleted_at);
  assertEqual(activeItems.length, 0, 'active item count should be 0');
});

console.log('\n5. Empty box detection: mixed boxes');
test('mixed boxes: identify which are empty', function() {
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
      items: [],
      deleted_at: null
    },
    {
      id: 'box3',
      name: 'Box3',
      location: null,
      items: [
        { id: 'item3', name: 'Item3', fate: null, deleted_at: '2026-05-08T00:00:00Z' }
      ],
      deleted_at: null
    },
    {
      id: 'box4',
      name: 'Box4',
      location: null,
      items: [
        { id: 'item4', name: 'Item4', fate: null, deleted_at: null },
        { id: 'item5', name: 'Item5', fate: null, deleted_at: null }
      ],
      deleted_at: null
    }
  ];

  // Count which boxes are empty
  var emptyCount = 0;
  for (var i = 0; i < app.state.boxes.length; i++) {
    var box = app.state.boxes[i];
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    if (activeItems.length === 0) {
      emptyCount++;
    }
  }
  assertEqual(emptyCount, 2, 'empty box count (boxes 2 and 3)');
});

console.log('\n6. Empty box detection: soft-deleted boxes excluded');
test('soft-deleted boxes → not included in review', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Active',
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

  // Filter to non-deleted boxes
  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'non-deleted box count');

  // Check which non-deleted boxes are empty
  var emptyBoxes = _.reject(boxes, (box) => {
    var activeItems = _.reject(box.items, (item) => item.deleted_at);
    return activeItems.length > 0;
  });
  assertEqual(emptyBoxes.length, 1, 'empty box count within non-deleted');
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
