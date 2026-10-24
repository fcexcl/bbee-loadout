'use strict';
/* 与 Python 参考实现（core/rules.py）的对拍向量。
 * 向量由 BBEE-Sim/local_data/publish/prepare_public.py 生成，JS 侧只读。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DATA, R, CARDS } = require('./helpers.js');
const parity = require('./fixtures/parity.json');

const toPicks = (rows) => rows.map(([row, slot, id]) => ({ row, slot, cardId: id }));

test('parity: 卡牌规范哈希与参考实现一致', () => {
  assert.equal(DATA.cardsSha256, parity.cardsSha256);
});

test('parity: validate 输出逐条一致', () => {
  for (let i = 0; i < parity.scenarios.length; i++) {
    const s = parity.scenarios[i];
    const got = R.validate(CARDS, toPicks(s.picks)).map((x) => [x.code, x.message, x.cards]);
    assert.deepEqual(got, s.v, `第 ${i} 组 picks=${JSON.stringify(s.picks)}`);
  }
});

test('parity: warnings 输出逐条一致', () => {
  for (let i = 0; i < parity.scenarios.length; i++) {
    const s = parity.scenarios[i];
    const got = R.warnings(CARDS, toPicks(s.picks)).map((x) => [x.code, x.message, x.cards]);
    assert.deepEqual(got, s.w, `第 ${i} 组 picks=${JSON.stringify(s.picks)}`);
  }
});

test('parity: candidates 的 id/ok/reason 逐条一致', () => {
  for (let i = 0; i < parity.candidateQueries.length; i++) {
    const q = parity.candidateQueries[i];
    const got = R.candidates(CARDS, toPicks(q.picks), q.row, q.slot)
      .map(([c, ok, reason]) => [c.id, ok, reason]);
    assert.deepEqual(got, q.candidates, `第 ${i} 组 row=${q.row} slot=${q.slot}`);
  }
});
