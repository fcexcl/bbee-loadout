'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DATA, CARDS } = require('./helpers.js');
const { webpInfo } = require('../tools/lib.mjs');
const media = require('../data/media.json');

const ROOT = path.resolve(__dirname, '..');

test('media: data/media.json 存在', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'data', 'media.json')));
});
test('media: 每个 id 都能在卡牌目录里找到', () => {
  const bad = Object.keys(media).filter((id) => !CARDS.has(id));
  assert.deepEqual(bad, [], `media 里有不存在的 id：${bad.slice(0, 5)}`);
});
test('media: 图标是真实 WebP 且 ≤256', () => {
  for (const [id, m] of Object.entries(media)) {
    const file = path.join(ROOT, m.icon);
    assert.ok(fs.existsSync(file), `${id} 的图标缺失：${m.icon}`);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length > 1024, `${id} 的图标疑似空文件`);
    const info = webpInfo(buf);
    assert.ok(info.width <= 256 && info.height <= 256, `${id} 图标过大：${info.width}x${info.height}`);
  }
});
test('media: 每张卡都有游戏内描述', () => {
  const empty = Object.entries(media).filter(([, m]) => !(m.description || '').trim());
  assert.deepEqual(empty.map(([id]) => id), []);
});
test('media: 覆盖 297 张且有 297 个不同图标', () => {
  assert.equal(Object.keys(media).length, 297);
  assert.equal(new Set(Object.values(media).map((m) => m.icon)).size, 297);
});
test('media: 叠加确实进了卡牌对象', () => {
  const withIcon = DATA.cards.filter((c) => c.icon);
  assert.equal(withIcon.length, Object.keys(media).length);
  const c = DATA.cards.find((x) => x.name === '火焰飞剑');
  assert.ok(c, '找不到 火焰飞剑');
  assert.match(c.desc, /340/);
  assert.equal(c.unlock, '[冲刺飞剑]');
});
