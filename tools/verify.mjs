#!/usr/bin/env node
/* 发布前严格校验：产物一致性、数据完整性、图标、本机信息、体积、引用、离线、测试。
 *   node tools/verify.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, extname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
import { readJson, sha256, findForbidden, isTextFile, webpInfo } from './lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
let failed = 0;

function check(name, fn) {
  try {
    const detail = fn();
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}
function must(cond, message) {
  if (!cond) throw new Error(message);
}
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
function pngInfo(buf) {
  must(buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG', '不是 PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// 1) 已提交产物必须与数据一致（也保证确定性）
check('build --check（产物可重现）', () => {
  const r = spawnSync(process.execPath, ['tools/build.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | '));
  return (r.stdout || '').trim();
});

const pkg = readJson(join(ROOT, 'package.json'));
const meta = readJson(join(ROOT, 'data', 'meta.json'));
const report = readJson(join(ROOT, 'build-report.json'));
const media = readJson(join(ROOT, 'data', 'media.json'));
const data = (await import(pathToFileURL(join(ROOT, 'js', 'data.js')).href)).default;

check('版本一致（package / data / report / sw）', () => {
  must(pkg.version === data.appVersion, `package ${pkg.version} != data ${data.appVersion}`);
  must(meta.dataVersion === data.dataVersion, `meta ${meta.dataVersion} != data ${data.dataVersion}`);
  must(report.appVersion === pkg.version && report.dataVersion === meta.dataVersion, 'build-report 版本不一致');
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  must(sw.includes(`bbee-sim-v${pkg.version}`), `sw.js 缓存版本不是 bbee-sim-v${pkg.version}`);
  return `v${pkg.version} / 数据 ${meta.dataVersion}`;
});

check('卡牌数据完整性', () => {
  const byId = new Map();
  for (const c of data.cards) {
    must(!byId.has(c.id), `id 重复：${c.id}`);
    byId.set(c.id, c);
    must(c.icon && c.icon.startsWith('icons/') && c.icon.endsWith('.webp'), `图标路径异常：${c.id}`);
    must(c.desc && c.desc.trim(), `缺少描述：${c.id}`);
    if (c.kind === 't1') must(c.trigger, `一级缺少触发方式：${c.id}`);
    if (c.kind === 'dual') {
      must(c.pos.length > 0 && c.prereq.length > 0, `双重缺少 pos/prereq：${c.id}`);
      for (const g of c.prereq) for (const n of g) {
        must(data.cards.some((x) => x.name === n), `前置卡名不存在：${c.id} -> ${n}`);
      }
      for (const p of c.pos) must(data.rows.includes(p), `pos 不是合法行：${c.id} -> ${p}`);
    }
  }
  const counts = { total: data.cards.length };
  for (const k of ['t1', 't2', 't3', 'dual']) counts[k] = data.cards.filter((c) => c.kind === k).length;
  must(counts.total === 297 && counts.t1 === 51 && counts.t2 === 109 && counts.t3 === 37 && counts.dual === 100,
    `数量异常：${JSON.stringify(counts)}`);
  return `${counts.total} 张`;
});

check('规范哈希与构建报告', () => {
  must(data.cardsSha256 === meta.cardsSha256, 'data/meta.json 哈希不一致');
  must(data.cardsSha256 === report.cardsSha256, 'build-report 哈希不一致');
  const js = readFileSync(join(ROOT, 'js', 'data.js'), 'utf8');
  must(report.artifacts['js/data.js'].sha256 === sha256(js), 'build-report 里 data.js 的 sha256 不对');
  must(report.artifacts['js/data.js'].bytes === Buffer.byteLength(js), 'build-report 里 data.js 字节数不对');
  return data.cardsSha256.slice(0, 16);
});

check('图标：数量 / 格式 / 尺寸 / 体积', () => {
  const refs = new Set();
  let bytes = 0;
  for (const c of data.cards) {
    must(!refs.has(c.icon), `图标重复引用：${c.icon}`);
    refs.add(c.icon);
    const p = join(ROOT, c.icon);
    must(existsSync(p), `缺少图标：${c.icon}`);
    const buf = readFileSync(p);
    const info = webpInfo(buf);
    must(info.width <= 256 && info.height <= 256, `${c.icon} 尺寸 ${info.width}x${info.height} > 256`);
    must(buf.length <= 12 * 1024, `${c.icon} 体积 ${buf.length} > 12 KiB`);
    bytes += buf.length;
  }
  const files = readdirSync(join(ROOT, 'icons')).filter((f) => f.endsWith('.webp'));
  must(files.length === 297, `icons/ 有 ${files.length} 个 webp`);
  const orphan = files.filter((f) => !refs.has(`icons/${f}`));
  must(orphan.length === 0, `未引用图标：${orphan.slice(0, 3).join(', ')}`);
  must(bytes <= 2 * 1024 * 1024, `图标总量 ${(bytes / 1024 / 1024).toFixed(2)} MiB > 2 MiB`);
  return `${files.length} 张 / ${(bytes / 1024 / 1024).toFixed(2)} MiB`;
});

check('media：脱敏字段与覆盖', () => {
  const allowed = new Set(['description', 'icon', 'slots', 'unlock']);
  const bad = [];
  for (const [id, m] of Object.entries(media)) {
    for (const k of Object.keys(m)) if (!allowed.has(k)) bad.push(`${id}.${k}`);
  }
  must(bad.length === 0, `media.json 还有内部字段：${bad.slice(0, 3).join(', ')}`);
  must(Object.keys(media).length === 297, 'media 覆盖不是 297');
  const ids = new Set(data.cards.map((c) => c.id));
  must(Object.keys(media).every((id) => ids.has(id)), 'media 有目录里不存在的 id');
  return '297 / 4 字段';
});

check('本机 / 内部信息扫描', () => {
  const skip = new Set(['tools/lib.mjs', 'tools/verify.mjs']);
  const hits = [];
  for (const p of walk(ROOT)) {
    if (!isTextFile(p)) continue;
    const rel = relative(ROOT, p).replaceAll('\\', '/');
    if (skip.has(rel)) continue;
    const text = readFileSync(p, 'utf8');
    for (const h of findForbidden(text, rel)) hits.push(`${rel}: ${h.name}`);
  }
  must(hits.length === 0, hits.slice(0, 6).join('；'));
  return '0 命中';
});

check('HTML / manifest / sw 引用都存在', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|data:|#|mailto:)/.test(ref)) throw new Error(`不应有外部引用：${ref}`);
    const file = ref.split(/[?#]/)[0];
    must(existsSync(join(ROOT, file)), `index.html 引用了不存在的文件：${ref}`);
  }
  const manifest = readJson(join(ROOT, 'manifest.webmanifest'));
  must(manifest.display === 'standalone', 'manifest.display 不是 standalone');
  must(manifest.start_url === './' && manifest.scope === './', 'manifest 的 start_url/scope 应为 ./');
  for (const icon of manifest.icons) {
    const p = join(ROOT, icon.src);
    must(existsSync(p), `manifest 图标不存在：${icon.src}`);
    const info = pngInfo(readFileSync(p));
    must(`${info.width}x${info.height}` === icon.sizes, `${icon.src} 实际 ${info.width}x${info.height} != ${icon.sizes}`);
  }
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  for (const m of sw.matchAll(/'\.\/([^']+)'/g)) {
    const ref = m[1];
    if (!ref || ref.endsWith('/')) continue;
    must(existsSync(join(ROOT, ref)), `sw.js 预缓存文件不存在：${ref}`);
  }
  return `manifest ${manifest.icons.length} 图标，sw 预缓存 ${sw.match(/'\.\//g).length} 项`;
});

check('运行时无外部网络依赖', () => {
  for (const f of ['index.html', 'style.css', 'js/app.js', 'js/rules.js', 'js/data.js', 'sw.js']) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const m = /https?:\/\//.exec(text);
    must(!m, `${f} 含外部 URL`);
  }
  return '6 个运行时文件';
});

check('运行时无后端 / 网络请求', () => {
  for (const f of ['js/app.js', 'js/rules.js', 'js/data.js']) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    must(!/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket/.test(text), `${f} 含网络请求代码`);
  }
  const css = readFileSync(join(ROOT, 'style.css'), 'utf8');
  must(!/url\(\s*['"]?https?:/i.test(css), 'style.css 引用了外部资源');
  return '3 个 JS + CSS';
});

check('黄金构筑 0 冲突', () => {
  const builds = readJson(join(ROOT, 'tests', 'fixtures', 'builds-golden.json'));
  const rules = require(join(ROOT, 'js', 'rules.js'));
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  for (const [name, b] of Object.entries(builds)) {
    const picks = b.picks.map((p) => ({ row: p.row, slot: p.slot, cardId: p.id }));
    const v = rules.validate(cards, picks);
    must(v.length === 0, `${name} 有冲突：${v.map((x) => x.message).join(' / ')}`);
  }
  return `${Object.keys(builds).length} 套`;
});

check('体积预算', () => {
  const all = walk(ROOT);
  const total = all.reduce((n, p) => n + statSync(p).size, 0);
  const dataJs = statSync(join(ROOT, 'js', 'data.js')).size;
  const parity = statSync(join(ROOT, 'tests', 'fixtures', 'parity.json')).size;
  must(total <= 8 * 1024 * 1024, `仓库 ${(total / 1024 / 1024).toFixed(2)} MiB > 8 MiB`);
  must(dataJs <= 200 * 1024, `data.js ${(dataJs / 1024).toFixed(0)} KiB > 200 KiB`);
  must(parity <= 1.6 * 1024 * 1024, `parity.json ${(parity / 1024).toFixed(0)} KiB > 1.6 MiB`);
  return `仓库 ${(total / 1024 / 1024).toFixed(2)} MiB（data.js ${(dataJs / 1024).toFixed(0)} KiB，parity ${(parity / 1024).toFixed(0)} KiB）`;
});

check('Node 测试全过', () => {
  const r = spawnSync(process.execPath, ['--test'], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) throw new Error(out.split('\n').filter((x) => /^(✖|ℹ fail)/.test(x)).slice(0, 4).join(' | '));
  const pass = /ℹ pass (\d+)/.exec(out);
  const fail = /ℹ fail (\d+)/.exec(out);
  must(pass && fail && Number(fail[1]) === 0, '测试统计异常');
  return `${pass[1]} 组通过`;
});

console.log(failed === 0 ? '\nVERIFY OK' : `\nVERIFY FAILED（${failed} 项）`);
process.exit(failed === 0 ? 0 : 1);
