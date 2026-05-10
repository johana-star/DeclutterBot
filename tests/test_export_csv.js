// test_export_csv.js — Tests for CSV export
// Run with: node test_export_csv.js

// ── STUBS ─────────────────────────────────────────────────────────────────────
var lastBotMessage = null;
var downloadedFile = null;

global.addBotMessage = function(text) { lastBotMessage = text; };
global.addUserMessage = function() {};
global.setChips = function() {};
global.setBoxOpenChips = function() {};
global.renderSidebar = function() {};
global.updateContextBar = function() {};
global.showTyping = function() {};
global.hideTyping = function() {};
global.saveState = function() {};
global.chipClick = function() {};
global.escHtml = function(s) { return String(s||''); };
global.renderMarkdown = function(s) { return s; };
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.Blob = function(parts, opts) { this.text = parts[0]; };
global.URL = {
  createObjectURL: function() { return 'blob:mock'; },
  revokeObjectURL: function() {}
};
global.document = {
  getElementById: function() {
    return {
      innerHTML: '',
      value: '',
      style: {},
      scrollTop: 0,
      click: function() {}
    };
  },
  createElement: function(tag) {
    if (tag === 'a') {
      return {
        href: '',
        download: '',
        click: function() { downloadedFile = this.download; }
      };
    }
    return { className: '', innerHTML: '', appendChild: function(){}, style: {} };
  }
};

var app = require('../app.js');
var state = app.state;
var uid = app.uid;
var escapeCSV = app.escapeCSV;
var exportCSV = app.exportCSV;

// ── HARNESS ───────────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
function assert(desc, condition) {
  if (condition) { console.log('  ✅ ' + desc); passed++; }
  else           { console.error('  ❌ ' + desc); failed++; }
}

function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.storageFull = false;
  state.conversationStage = 'BOX_OPEN';
  lastBotMessage = null;
  downloadedFile = null;
}

// ── TESTS ──────────────────────────────────────────────────────────────────────

console.log('\nCSV Export Tests\n');

console.log('1. escapeCSV: normal field unchanged');
assert('plain text', escapeCSV('Kitchen') === 'Kitchen');
assert('number', escapeCSV(5) === '5');
assert('empty string', escapeCSV('') === '');
assert('null', escapeCSV(null) === '');

console.log('\n2. escapeCSV: comma in field quoted');
var withComma = escapeCSV('value, with comma');
assert('quoted', withComma === '"value, with comma"');

console.log('\n3. escapeCSV: quote in field escaped');
var withQuote = escapeCSV('value "quoted"');
assert('doubled quotes', withQuote === '"value ""quoted"""');

console.log('\n4. escapeCSV: newline in field quoted');
var withNewline = escapeCSV('line1\nline2');
assert('quoted', withNewline === '"line1\nline2"');

console.log('\n5. Empty inventory exports header only');
reset();
var csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
var lines = csv.split('\n');
assert('header present', lines[0] === 'location,box name,item name,fate,notes,box id,item id');
assert('only header', lines.length === 1);

console.log('\n6. Single item exports correctly');
reset();
state.boxes = [{
  id: 'b1',
  name: 'Kitchen',
  location: 'kitchen',
  notes: '',
  parentId: null,
  createdAt: '',
  items: [{
    id: 'i1',
    name: 'Bowl',
    fate: 'keep',
    notes: 'chipped',
    deleted_at: null,
    description: '',
    createdAt: ''
  }]
}];
csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
lines = csv.split('\n');
assert('header + 1 item', lines.length === 2);
assert('correct item row', lines[1].startsWith('kitchen,Kitchen,Bowl,keep,chipped,'));

console.log('\n7. Multiple items same box');
reset();
state.boxes = [{
  id: 'b1',
  name: 'Kitchen',
  location: 'kitchen',
  notes: '',
  parentId: null,
  createdAt: '',
  items: [
    { id: 'i1', name: 'Bowl', fate: 'keep', notes: 'chipped', deleted_at: null, description: '', photos: [], createdAt: '' },
    { id: 'i2', name: 'Plate', fate: 'donate', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }
  ]
}];
csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
lines = csv.split('\n');
assert('header + 2 items', lines.length === 3);
assert('item 1', lines[1].startsWith('kitchen,Kitchen,Bowl,keep,chipped,'));
assert('item 2', lines[2].startsWith('kitchen,Kitchen,Plate,donate,,'));

console.log('\n8. Multiple boxes');
reset();
state.boxes = [
  {
    id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '',
    items: [{ id: 'i1', name: 'Bowl', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }]
  },
  {
    id: 'b2', name: 'Bedroom', location: 'bedroom', notes: '', parentId: null, createdAt: '',
    items: [{ id: 'i2', name: 'Lamp', fate: 'unsure', notes: 'needs bulb', deleted_at: null, description: '', photos: [], createdAt: '' }]
  }
];
csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
lines = csv.split('\n');
assert('header + 2 items from 2 boxes', lines.length === 3);
assert('kitchen item', lines[1].startsWith('kitchen,Kitchen,Bowl,keep,,'));
assert('bedroom item', lines[2].startsWith('bedroom,Bedroom,Lamp,unsure,needs bulb,'));

console.log('\n9. Soft-deleted items included');
reset();
state.boxes = [{
  id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '',
  items: [
    { id: 'i1', name: 'Bowl', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' },
    { id: 'i2', name: 'Trash', fate: 'trash', notes: '', deleted_at: '2026-05-08T00:00:00Z', description: '', photos: [], createdAt: '' }
  ]
}];
csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
lines = csv.split('\n');
assert('header + 2 items (deleted included)', lines.length === 3);
assert('active item', lines[1].startsWith('kitchen,Kitchen,Bowl,keep,,'));
assert('deleted item', lines[2].startsWith('kitchen,Kitchen,Trash,trash,,'));

console.log('\n10. Special characters escaped in fields');
reset();
state.boxes = [{
  id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '',
  items: [{
    id: 'i1',
    name: 'Bowl, ceramic',
    fate: 'keep',
    notes: 'says "fragile"',
    deleted_at: null,
    description: '',
    createdAt: ''
  }]
}];
csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
lines = csv.split('\n');
assert('comma and quotes escaped', lines[1].startsWith('kitchen,Kitchen,"Bowl, ceramic",keep,"says ""fragile""",'));

console.log('\n11. Empty location handled');
reset();
state.boxes = [{
  id: 'b1', name: 'Kitchen', location: '', notes: '', parentId: null, createdAt: '',
  items: [{ id: 'i1', name: 'Bowl', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }]
}];
csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
lines = csv.split('\n');
assert('empty location as empty field', lines[1].startsWith(',Kitchen,Bowl,keep,,'));

console.log('\n12. File downloaded with correct name');
reset();
downloadedFile = null;
state.boxes = [{
  id: 'b1', name: 'Kitchen', location: 'kitchen', notes: '', parentId: null, createdAt: '',
  items: [{ id: 'i1', name: 'Bowl', fate: 'keep', notes: '', deleted_at: null, description: '', photos: [], createdAt: '' }]
}];
csv = '';
global.Blob = function(parts) { csv = parts[0]; };
exportCSV();
assert('downloaded as inventory.csv', downloadedFile === 'inventory.csv');

// ── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log('✅ ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
