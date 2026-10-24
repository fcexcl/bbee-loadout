'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { R, CARDS, P, codes } = require('./helpers.js');

function legal(picks) {
  const v = R.validate(CARDS, picks);
  assert.deepEqual(v, [], `应为合法，却报了 ${v.map((x) => x.message).join(' / ')}`);
}
function violation(picks, code) {
  const v = R.validate(CARDS, picks);
  assert.ok(codes(v).has(code), `应报 ${code}，实际 ${v.map((x) => x.code).join(', ')}`);
}

test('basics: 空选择合法', () => legal([]));
test('basics: 行号越界报 BAD_SLOT', () => violation([P(9, 1, '普攻寒冷')], 'BAD_SLOT'));

test('branch: 同分支两个触发方式互斥', () => {
  violation([P(1, 1, '普攻寒冷'), P(2, 1, '技能寒冷')], 'BRANCH_T1_DUP');
});
test('branch: 同元素不同分支合法', () => {
  legal([P(1, 1, '普攻寒冷'), P(3, 1, '冲刺冰锥')]);
});
test('branch: 同分支多张二级合法', () => {
  legal([P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 3, '聚寒成冰')]);
});

test('chain: 二级需要一级', () => violation([P(1, 1, '寒气爆发')], 'MISSING_T1'));
test('chain: 三级需要二级', () => {
  violation([P(1, 1, '普攻寒冷'), P(1, 2, '冰霜爆破')], 'MISSING_T2');
});
test('chain: 完整一条线合法', () => {
  legal([P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 3, '冰霜爆破')]);
});

test('dual: 前置不齐报 DUAL_PREREQ', () => {
  violation([P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 3, '冰霜爆破'), P(1, 4, '冰锥极寒')], 'DUAL_PREREQ');
});
test('dual: 前置齐但缺效果分支三级报 DUAL_NEED_T3', () => {
  violation([P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(3, 1, '冲刺冰锥'), P(1, 3, '冰锥极寒')], 'DUAL_NEED_T3');
});
test('dual: 前置分组是组间 AND', () => {
  const base = [P(1, 1, '普攻撕裂'), P(1, 3, '致命撕裂'), P(1, 4, '撕裂光阵')];
  const withSummon = R.validate(CARDS, base.concat([P(2, 1, '召唤光阵')]));
  assert.ok(!codes(withSummon).has('DUAL_PREREQ'), withSummon.map((x) => x.message).join(' / '));
  assert.ok(codes(R.validate(CARDS, base)).has('DUAL_PREREQ'));
});
test('dual: need_t3 按效果分支而不是占位分支', () => {
  const base = [P(3, 1, '冲刺冰锥'), P(3, 7, '随机冰锥'), P(3, 9, '冰锥极寒')];
  assert.ok(codes(R.validate(CARDS, base)).has('DUAL_NEED_T3'));
  const withEffectT3 = base.concat([P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 7, '冰霜爆破')]);
  assert.ok(!codes(R.validate(CARDS, withEffectT3)).has('DUAL_NEED_T3'));
});
test('dual: 前置组内任一即可', () => {
  const picks = [
    P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 7, '冰霜爆破'),
    P(3, 1, '冲刺冰锥'), P(3, 7, '随机冰锥'), P(3, 9, '冰锥极寒'),
  ];
  const v = R.validate(CARDS, picks);
  assert.ok(!codes(v).has('DUAL_PREREQ'), v.map((x) => x.message).join(' / '));
  assert.ok(!codes(v).has('DUAL_NEED_T3'), v.map((x) => x.message).join(' / '));
});

test('slots: 行内不设 4 格上限（中毒 5 张二级）', () => {
  const picks = [P(1, 1, '普攻淬毒')];
  ['受击毒雾', '毒素污染', '强效中毒', '毒素扩散', '受击毒环'].forEach((n, i) => picks.push(P(1, i + 2, n)));
  legal(picks);
});
test('slots: 同分支多张三级合法', () => {
  legal([P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 7, '冰霜爆破'), P(1, 8, '强力破冰')]);
});
test('slots: 同一格重复占用报 SLOT_DUP', () => {
  violation([P(1, 1, '普攻寒冷'), P(1, 1, '普攻燃烧')], 'SLOT_DUP');
});

test('row: 一级放错行报 ROW_MISMATCH', () => violation([P(2, 1, '普攻寒冷')], 'ROW_MISMATCH'));
test('row: 进阶必须跟随一级所在行', () => {
  violation([P(1, 1, '普攻寒冷'), P(2, 1, '寒气爆发')], 'ROW_MISMATCH');
});

test('row-branch: 一级只能在第 1 格', () => violation([P(1, 2, '普攻寒冷')], 'T1_NOT_FIRST'));
test('row-branch: 同一行塞别的分支报 ROW_BRANCH_MIX', () => {
  violation([P(1, 1, '普攻寒冷'), P(1, 2, '光枪强化')], 'ROW_BRANCH_MIX');
});
test('row-branch: 第 2 格候选只来自本行分支', () => {
  const picks = [P(1, 1, '普攻寒冷')];
  for (const [c] of R.candidates(CARDS, picks, 1, 2)) {
    assert.equal(c.branch, '寒冷', `${c.name} 不属于寒冷分支却出现在候选里`);
  }
});
test('row-branch: 第 1 格候选只有本行一级', () => {
  for (const [c] of R.candidates(CARDS, [], 1, 1)) {
    assert.equal(c.kind, 't1', `${c.name} 不是一级却出现在第 1 格候选里`);
    assert.equal(c.trigger, '普攻');
  }
});
test('row-branch: 没选一级时第 2 格无候选', () => {
  assert.deepEqual(R.candidates(CARDS, [], 1, 2), []);
});

test('filter: 已选二级不再出现在候选', () => {
  const picks = [P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发')];
  const names = R.candidates(CARDS, picks, 1, 3).map(([c]) => c.name);
  assert.ok(!names.includes('寒气爆发'));
  assert.ok(names.includes('聚寒成冰'));
});
test('filter: 已选三级不再出现在候选', () => {
  const picks = [P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 7, '冰霜爆破')];
  const names = R.candidates(CARDS, picks, 1, 8).map(([c]) => c.name);
  assert.ok(!names.includes('冰霜爆破'));
  assert.ok(names.includes('强力破冰'));
});
test('filter: 同一张卡放两个格子报 CARD_DUP', () => {
  violation([P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 3, '寒气爆发')], 'CARD_DUP');
});

test('candidates: 被拒候选必须带原因', () => {
  const cands = R.candidates(CARDS, [P(1, 1, '普攻寒冷')], 2, 1);
  const rejected = cands.filter((x) => !x[1]);
  assert.ok(rejected.length > 0, '应该有被拒的候选');
  assert.ok(rejected.every((x) => x[2]), '被拒的候选都必须带原因');
});

test('slot-kind: 第 7 格只有三级', () => {
  const picks = [P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发')];
  for (const [c] of R.candidates(CARDS, picks, 1, 7)) assert.equal(c.kind, 't3');
});
test('slot-kind: 第 8 格只有三级', () => {
  const picks = [P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发')];
  for (const [c] of R.candidates(CARDS, picks, 1, 8)) assert.equal(c.kind, 't3');
});
test('slot-kind: 第 13 格只有双重', () => {
  for (const [c] of R.candidates(CARDS, [P(1, 1, '传承技黑洞')], 4, 13)) assert.equal(c.kind, 'dual');
});
test('slot-kind: 第 9 格只有双重', () => {
  const picks = [P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发')];
  for (const [c] of R.candidates(CARDS, picks, 1, 9)) assert.equal(c.kind, 'dual');
});
test('slot-kind: 第 5 格只有二级', () => {
  for (const [c] of R.candidates(CARDS, [P(1, 1, '普攻淬毒')], 1, 5)) assert.equal(c.kind, 't2');
});
test('slot-kind: 双重可以多张', () => {
  const v = R.validate(CARDS, [P(3, 1, '冲刺飞剑'), P(3, 7, '多重飞剑'), P(3, 9, '双向飞剑')]);
  assert.ok(!codes(v).has('BRANCH_DUAL_DUP'));
});

test('pos: 触发位不符时阻断并提示', () => {
  const picks = [P(1, 1, '普攻寒冷'), P(1, 2, '寒气爆发'), P(1, 7, '冰霜爆破'), P(1, 9, '冰锥极寒')];
  assert.ok(codes(R.validate(CARDS, picks)).has('POS_MISMATCH'));
  assert.deepEqual(R.warnings(CARDS, picks).map((x) => x.code), ['POS_WARN']);
});
test('pos: 触发位正确不阻断', () => {
  const picks = [P(3, 1, '冲刺冰锥'), P(3, 7, '随机冰锥'), P(3, 9, '冰锥极寒')];
  assert.ok(!codes(R.validate(CARDS, picks)).has('POS_MISMATCH'));
});
test('pos: 非双重不受触发位限制', () => {
  assert.ok(!codes(R.validate(CARDS, [P(1, 1, '普攻寒冷')])).has('POS_MISMATCH'));
});
