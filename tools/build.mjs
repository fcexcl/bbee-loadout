#!/usr/bin/env node
/* 把 data/*.json 构建成 js/data.js，并做严格校验。
 *
 *   node tools/build.mjs           生成 / 覆盖
 *   node tools/build.mjs --check   只检查已提交产物是否与数据一致（CI 用）
 *
 * 产物是确定性的：不含时间戳、不含机器路径、重复构建字节一致。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, sha256, findForbidden, webpInfo } from './lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const WRITE_META = process.argv.includes('--write-meta');

const ROWS = ['普攻', '技能', '冲刺', '传承', '召唤'];
const TRIGGERS = ['普攻', '技能', '冲刺', '传承', '召唤'];
const OVERRIDE = {
  放置地雷: '召唤',
  环绕电球: '召唤',
  玄冰剑刃: '普攻',
  火精灵助战: '普攻',
  圣光标记: '冲刺',
};
const EXPECTED = {
  elements: 7, total: 297, t1: 51, t2: 109, t3: 37, dual: 100,
  icons: 297, needT3: 100, rows: 5,
};
const KIND_TIER = { t1: 1, t2: 2, t3: 3, dual: 4 };

function fail(message) {
  console.error(`BUILD FAIL: ${message}`);
  process.exit(1);
}

function triggerOf(name) {
  if (OVERRIDE[name]) return OVERRIDE[name];
  for (const t of TRIGGERS) if (name.startsWith(t)) return t;
  if (name.startsWith('传承技')) return '传承';
  if (name.startsWith('电闪雷鸣')) return '传承';
  return null;
}

function groups(raw) {
  if (!raw || raw.length === 0) return [];
  if (typeof raw[0] === 'string') return [raw.slice()];
  return raw.map((g) => g.slice());
}

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function loadSources() {
  const pkg = readJson(join(ROOT, 'package.json'));
  const strategies = readJson(join(ROOT, 'data', 'strategies.json'));
  const media = readJson(join(ROOT, 'data', 'media.json'));
  const meta = readJson(join(ROOT, 'data', 'meta.json'));
  return { pkg, strategies, media, meta };
}

function flatten({ strategies, media }) {
  const cards = [];
  const nameSet = new Set();
  const effectBranchIndex = new Map();
  for (const [element, block] of Object.entries(strategies)) {
    effectBranchIndex.set(element, new Set(block.branches.map((b) => b.name)));
  }

  for (const [element, block] of Object.entries(strategies)) {
    for (const br of block.branches) {
      for (const kind of ['t1', 't2', 't3']) {
        for (const name of br[kind] || []) {
          const id = `${element}/${br.name}/${kind}/${name}`;
          cards.push({
            id, name, element, branch: br.name, kind, tier: KIND_TIER[kind],
            trigger: kind === 't1' ? triggerOf(name) : null,
            prereq: [], pos: [], needT3: false,
            desc: '', icon: '', slots: [], unlock: '',
            effectElement: element, effectBranch: br.name,
          });
          nameSet.add(name);
        }
      }
      for (const du of br.duals || []) {
        const id = `${element}/${br.name}/dual/${du.name}`;
        cards.push({
          id, name: du.name, element, branch: br.name, kind: 'dual', tier: KIND_TIER.dual,
          trigger: null,
          prereq: groups(du.prereq),
          pos: (du.pos || []).slice(),
          needT3: !!du.need_t3,
          desc: '', icon: '', slots: [], unlock: '',
          effectElement: du.effect_element || element,
          effectBranch: du.effect_branch || br.name,
        });
        nameSet.add(du.name);
      }
    }
  }

  for (const c of cards) {
    const m = media[c.id];
    if (!m) fail(`media.json 缺少卡牌：${c.id}`);
    c.desc = m.description || '';
    c.icon = m.icon || '';
    c.slots = (m.slots || []).slice();
    c.unlock = m.unlock || '';
    if (c.kind === 't1' && !c.trigger) fail(`一级策略没有触发方式：${c.name}`);
    if (c.kind !== 't1' && c.trigger !== null) fail(`非一级策略不应有 trigger：${c.id}`);
    if (c.kind === 'dual') {
      if (!c.pos.length) fail(`双重策略没有 pos：${c.id}`);
      if (!c.prereq.length) fail(`双重策略没有前置：${c.id}`);
    }
    if (!c.desc.trim()) fail(`卡牌没有描述：${c.id}`);
    if (!/^icons\/[a-z0-9]+\.webp$/.test(c.icon)) fail(`图标路径不合法：${c.id} -> ${c.icon}`);
  }

  const extra = Object.keys(media).filter((id) => !cards.some((c) => c.id === id));
  if (extra.length) fail(`media.json 有目录里不存在的 id：${extra.slice(0, 3).join(', ')}`);

  cards.sort((a, b) =>
    (a.tier - b.tier) || cmpStr(a.element, b.element) || cmpStr(a.branch, b.branch) || cmpStr(a.name, b.name));

  return { cards, nameSet, effectBranchIndex };
}

function validateCards({ cards, nameSet, effectBranchIndex }, strategies) {
  const byId = new Map();
  for (const c of cards) {
    if (byId.has(c.id)) fail(`卡牌 id 重复：${c.id}`);
    byId.set(c.id, c);
  }
  const counts = { total: cards.length };
  for (const k of ['t1', 't2', 't3', 'dual']) counts[k] = cards.filter((c) => c.kind === k).length;
  for (const [k, v] of Object.entries(EXPECTED)) {
    if (k === 'elements' || k === 'rows' || k === 'icons' || k === 'needT3') continue;
    if (counts[k] !== v) fail(`卡牌数量 ${k}=${counts[k]} != ${v}`);
  }
  if (Object.keys(strategies).length !== EXPECTED.elements) fail(`元素系数量 != ${EXPECTED.elements}`);
  if (ROWS.length !== EXPECTED.rows) fail(`行数 != ${EXPECTED.rows}`);
  if (cards.filter((c) => c.needT3).length !== EXPECTED.needT3) fail(`needT3 数量 != ${EXPECTED.needT3}`);

  for (const c of cards) {
    for (const g of c.prereq) {
      for (const n of g) if (!nameSet.has(n)) fail(`前置卡名不存在：${c.id} -> ${n}`);
    }
    for (const p of c.pos) if (!ROWS.includes(p)) fail(`pos 不是合法行：${c.id} -> ${p}`);
    const branches = effectBranchIndex.get(c.effectElement);
    if (!branches) fail(`效果系不存在：${c.id} -> ${c.effectElement}`);
    if (!branches.has(c.effectBranch)) fail(`效果分支不存在：${c.id} -> ${c.effectElement}/${c.effectBranch}`);
  }
  return { counts, byId };
}

function canonical(cards) {
  const rows = cards.map((c) => [
    c.id, c.name, c.element, c.branch, c.kind, c.tier,
    c.trigger || '',
    c.prereq.map((g) => g.join('|')),
    c.pos.join('|'),
    c.needT3 ? 1 : 0,
    c.desc, c.icon, c.slots.join('|'), c.unlock,
    c.effectElement, c.effectBranch,
  ]);
  return JSON.stringify(rows);
}

function iconStats(cards) {
  let bytes = 0, maxBytes = 0, maxWidth = 0, maxHeight = 0, minWidth = 9999, minHeight = 9999;
  const seen = new Set();
  for (const c of cards) {
    if (seen.has(c.icon)) fail(`图标被多张卡引用：${c.icon}`);
    seen.add(c.icon);
    const path = join(ROOT, c.icon);
    if (!existsSync(path)) fail(`图标文件缺失：${c.icon}`);
    const buf = readFileSync(path);
    let info;
    try {
      info = webpInfo(buf);
    } catch (err) {
      fail(`${c.icon} 不是合法 WebP：${err.message}`);
    }
    if (info.width > 256 || info.height > 256) fail(`${c.icon} 尺寸 ${info.width}x${info.height} 超过 256`);
    if (buf.length > 12 * 1024) fail(`${c.icon} 体积 ${buf.length} 超过 12 KiB`);
    bytes += buf.length;
    maxBytes = Math.max(maxBytes, buf.length);
    maxWidth = Math.max(maxWidth, info.width);
    maxHeight = Math.max(maxHeight, info.height);
    minWidth = Math.min(minWidth, info.width);
    minHeight = Math.min(minHeight, info.height);
  }
  const onDisk = readdirSync(join(ROOT, 'icons')).filter((f) => f.endsWith('.webp'));
  const expected = [...seen].map((p) => basename(p));
  const orphans = onDisk.filter((f) => !expected.includes(f));
  if (orphans.length) fail(`icons/ 有未引用的文件：${orphans.slice(0, 5).join(', ')}`);
  if (onDisk.length !== EXPECTED.icons) fail(`图标数量 ${onDisk.length} != ${EXPECTED.icons}`);
  return { count: onDisk.length, bytes, maxBytes, maxWidth, maxHeight, minWidth, minHeight };
}

function main() {
  const sources = loadSources();
  const { pkg, meta } = sources;
  if (!pkg.version) fail('package.json 缺少 version');
  if (!meta.dataVersion) fail('data/meta.json 缺少 dataVersion');

  const flat = flatten(sources);
  const { counts } = validateCards(flat, sources.strategies);
  const cardsSha = sha256(canonical(flat.cards));
  if (cardsSha !== meta.cardsSha256) {
    if (!WRITE_META || CHECK) {
      fail(`卡牌规范哈希与 data/meta.json 不一致：${cardsSha} != ${meta.cardsSha256}（数据被改过但 meta 没更新？维护者可用 --write-meta）`);
    }
    meta.cardsSha256 = cardsSha;
    writeFileSync(join(ROOT, 'data', 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
    console.log(`已更新 data/meta.json：cardsSha256=${cardsSha}`);
  }
  const icons = iconStats(flat.cards);

  const data = {
    appVersion: pkg.version,
    dataVersion: meta.dataVersion,
    cardsSha256: cardsSha,
    rows: ROWS,
    slots: { t1: 1, t2First: 2, t2Last: 6, t3First: 7, t3Last: 8, dualFirst: 9, dualLast: 13 },
    cards: flat.cards,
  };
  const dataJs = `/* 由 tools/build.mjs 生成，请勿手改。数据版本 ${meta.dataVersion}。 */\n` +
    '(function (root, data) {\n' +
    "  if (typeof module === 'object' && module.exports) module.exports = data;\n" +
    '  else root.BBEE_DATA = data;\n' +
    "})(typeof globalThis !== 'undefined' ? globalThis : this, " + JSON.stringify(data) + ');\n';

  const report = {
    appVersion: pkg.version,
    dataVersion: meta.dataVersion,
    cardsSha256: cardsSha,
    cards: counts,
    icons,
    artifacts: { 'js/data.js': { bytes: Buffer.byteLength(dataJs), sha256: sha256(dataJs) } },
    checks: [
      'expected-counts', 'unique-ids', 't1-trigger', 'prereq-names', 'pos-rows',
      'effect-branch', 'media-coverage', 'icon-coverage', 'icon-format', 'icon-budget',
      'canonical-hash', 'forbidden-scan',
    ],
  };
  const reportJson = JSON.stringify(report, null, 2) + '\n';

  const hits = findForbidden(dataJs, 'js/data.js').concat(findForbidden(reportJson, 'build-report.json'));
  if (hits.length) fail(`产物含本机/内部信息：${hits.map((h) => h.name).join(', ')}`);

  const outputs = [
    [join(ROOT, 'js', 'data.js'), dataJs],
    [join(ROOT, 'build-report.json'), reportJson],
  ];

  if (CHECK) {
    let stale = false;
    for (const [path, text] of outputs) {
      if (!existsSync(path)) { console.error(`缺少产物：${path.replace(ROOT, '.')}`); stale = true; continue; }
      const cur = readFileSync(path, 'utf8');
      if (cur !== text) {
        console.error(`产物与数据不一致：${path.replace(ROOT, '.')}`);
        console.error(`  磁盘 ${cur.length} 字节 / 期望 ${text.length} 字节，sha256 ${sha256(cur).slice(0, 12)} != ${sha256(text).slice(0, 12)}`);
        stale = true;
      }
    }
    if (stale) fail('产物过期：请运行 node tools/build.mjs');
    console.log(`BUILD CHECK OK：${counts.total} 张 / 图标 ${icons.count} (${(icons.bytes / 1024 / 1024).toFixed(2)} MiB) / data.js ${(Buffer.byteLength(dataJs) / 1024).toFixed(0)} KiB`);
    return;
  }

  for (const [path, text] of outputs) writeFileSync(path, text);
  console.log(`BUILD OK：${counts.total} 张（Ⅰ${counts.t1} / Ⅱ${counts.t2} / Ⅲ${counts.t3} / 双${counts.dual}）`);
  console.log(`图标 ${icons.count} 张 ${(icons.bytes / 1024 / 1024).toFixed(2)} MiB，最大 ${(icons.maxBytes / 1024).toFixed(1)} KiB，尺寸 ≤ ${icons.maxWidth}x${icons.maxHeight}`);
  console.log(`data.js ${(Buffer.byteLength(dataJs) / 1024).toFixed(0)} KiB，sha256 ${report.artifacts['js/data.js'].sha256.slice(0, 16)}`);
}

main();
