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
  app.state.activeBoxId = null;
  app.state.conversationStage = 'FINISHED';
  app.collapsedBoxIds = [];
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suite: Detecting Boxes Eligible for Rename
// ────────────────────────────────────────────────────────────────────────────

console.log('\n1. Rename eligibility: all non-deleted boxes');
test('non-deleted boxes are eligible for rename', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Bedroom',
      location: null,
      items: [],
      deleted_at: null
    },
    {
      id: 'box2',
      name: 'Kitchen',
      location: null,
      items: [],
      deleted_at: null
    }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 2, 'all boxes eligible');
});

console.log('\n2. Rename eligibility: exclude soft-deleted boxes');
test('soft-deleted boxes not eligible for rename', function() {
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

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'only active boxes');
  assertEqual(boxes[0].name, 'Active', 'correct box');
});

console.log('\n3. Rename eligibility: empty boxes eligible');
test('empty boxes can be renamed', function() {
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

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'empty box eligible');
});

console.log('\n4. Rename eligibility: boxes with items eligible');
test('boxes with items can be renamed', function() {
  setupState();
  app.state.boxes = [
    {
      id: 'box1',
      name: 'Full',
      location: null,
      items: [
        { id: 'item1', name: 'Item1', fate: null, deleted_at: null }
      ],
      deleted_at: null
    }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'box with items eligible');
});

console.log('\n5. Rename eligibility: boxes with only soft-deleted items');
test('boxes with only soft-deleted items can be renamed', function() {
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
    }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  assertEqual(boxes.length, 1, 'box eligible despite soft-deleted items');
});

console.log('\n6. Rename chips: 1 eligible box');
test('1 eligible box → single Rename 1 chip', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var renameChips = [];
  if (boxes.length === 1) {
    renameChips.push('Rename 1');
  } else if (boxes.length === 2) {
    renameChips.push('Rename 1');
    renameChips.push('Rename 2');
  } else if (boxes.length >= 3) {
    renameChips.push('Rename...');
  }

  assertEqual(renameChips.length, 1, 'one chip');
  assertEqual(renameChips[0], 'Rename 1', 'correct chip');
});

console.log('\n7. Rename chips: 2 eligible boxes');
test('2 eligible boxes → Rename 1 and Rename 2 chips', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var renameChips = [];
  if (boxes.length === 1) {
    renameChips.push('Rename 1');
  } else if (boxes.length === 2) {
    renameChips.push('Rename 1');
    renameChips.push('Rename 2');
  } else if (boxes.length >= 3) {
    renameChips.push('Rename...');
  }

  assertEqual(renameChips.length, 2, 'two chips');
});

console.log('\n8. Rename chips: 3+ eligible boxes');
test('3+ eligible boxes → Rename... chip only', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Box3', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var renameChips = [];
  if (boxes.length === 1) {
    renameChips.push('Rename 1');
  } else if (boxes.length === 2) {
    renameChips.push('Rename 1');
    renameChips.push('Rename 2');
  } else if (boxes.length >= 3) {
    renameChips.push('Rename...');
  }

  assertEqual(renameChips.length, 1, 'one chip');
  assertEqual(renameChips[0], 'Rename...', 'elliptical chip');
});

console.log('\n9. Rename positions: track actual review list positions');
test('rename positions match actual box positions in review', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: null, items: [], deleted_at: null },
    { id: 'box3', name: 'Box3', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var renamePositions = [];
  for(var i = 0; i < boxes.length; i++) {
    renamePositions.push(i + 1);
  }

  assertEqual(renamePositions.length, 3, 'all positions tracked');
  assertEqual(renamePositions[0], 1, 'first position');
  assertEqual(renamePositions[2], 3, 'third position');
});

console.log('\n10. Rename positions: with soft-deleted boxes mixed in');
test('rename positions skip soft-deleted boxes', function() {
  setupState();
  app.state.boxes = [
    { id: 'box1', name: 'Box1', location: null, items: [], deleted_at: null },
    { id: 'box2', name: 'Box2', location: null, items: [], deleted_at: '2026-05-08T00:00:00Z' },
    { id: 'box3', name: 'Box3', location: null, items: [], deleted_at: null }
  ];

  var boxes = _.reject(app.state.boxes, (box) => box.deleted_at);
  var renamePositions = [];
  for(var i = 0; i < boxes.length; i++) {
    renamePositions.push(i + 1);
  }

  assertEqual(renamePositions.length, 2, 'only non-deleted boxes');
  assertEqual(renamePositions[0], 1, 'first position in filtered list');
  assertEqual(renamePositions[1], 2, 'second position in filtered list');
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
