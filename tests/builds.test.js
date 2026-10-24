'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { R, CARDS } = require('./helpers.js');
const builds = require('./fixtures/builds-golden.json');

function picksOf(name) {
  return builds[name].picks.map((p) => ({ row: p.row, slot: p.slot, cardId: p.id }));
}

test('golden: 固定两套实机构筑', () => {
  assert.deepEqual(Object.keys(builds).sort(), ['构筑 1', '构筑 2'].sort());
});
test('golden: 所有卡 id 都存在', () => {
  for (const name of Object.keys(builds)) {
    for (const p of builds[name].picks) assert.ok(CARDS.has(p.id), `${name} 里有不存在的卡：${p.id}`);
  }
});
test('golden: 两套实机构筑 0 冲突', () => {
  for (const name of Object.keys(builds)) {
    const v = R.validate(CARDS, picksOf(name));
    assert.deepEqual(v, [], `${name} 不应有冲突：${v.map((x) => x.message).join(' / ')}`);
  }
});
test('golden: 双重数量与实机一致', () => {
  for (const [name, n] of [['构筑 1', 4], ['构筑 2', 5]]) {
    const duals = builds[name].picks.filter((p) => CARDS.get(p.id).kind === 'dual');
    assert.equal(duals.length, n);
  }
});
