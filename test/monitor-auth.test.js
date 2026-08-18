const test = require('node:test');
const assert = require('node:assert/strict');
const { safeEqual } = require('../backend/monitor-auth');

test('monitor credentials use a timing-safe equality check', () => {
  assert.equal(safeEqual('admin', 'admin'), true);
  assert.equal(safeEqual('admin', 'wrong'), false);
  assert.equal(safeEqual('short', 'much-longer'), false);
});
