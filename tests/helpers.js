'use strict';
const assert = require('node:assert/strict');
const DATA = require('../js/data.js');
const R = require('../js/rules.js');

const CARDS = new Map(DATA.cards.map((c) => [c.id, c]));

function cid(name) {
  const hits = DATA.cards.filter((c) => c.name === name);
  assert.equal(hits.length, 1, `卡名「${name}」命中 ${hits.length} 张，用例写法有误`);
  return hits[0].id;
}
function P(row, slot, nameOrId) {
  return { row, slot, cardId: CARDS.has(nameOrId) ? nameOrId : cid(nameOrId) };
}
function codes(v) {
  return new Set(v.map((x) => x.code));
}
module.exports = { DATA, R, CARDS, cid, P, codes };
