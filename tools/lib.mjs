// 构建/校验共用的小工具（无第三方依赖）。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export const FORBIDDEN = [
  { name: 'Windows 盘符路径', re: /\b[A-Za-z]:[\\/]/ },
  { name: '回环地址', re: /127\.0\.0\.1/ },
  { name: 'localhost', re: /localhost/i },
  { name: '旧端口 8765', re: /8765/ },
  { name: '工作区路径', re: /workspace_dsh/i },
  { name: '虚拟环境', re: /\.venv/i },
  { name: 'Steam 安装路径', re: /Steam/i },
  { name: '网盘路径', re: /BaiduNetdisk/i },
  { name: '用户视频目录', re: /UserFiles/i },
  { name: '录屏来源', re: /录屏|屏幕录制/ },
  { name: '内部字段 page', re: /"page"\s*:/ },
  { name: '内部字段 time_sec', re: /"time_sec"\s*:/ },
  { name: '内部字段 source', re: /"source"\s*:/ },
  { name: '内部字段 tips', re: /"tips"\s*:/ },
  { name: '内部管线 run_all', re: /run_all|run_deepseek/ },
];

// 允许开发服务器在唯一一处使用回环地址。
export const ALLOW_LOOPBACK = new Set(['tools/serve.mjs']);

export function readJson(path) {
  return JSON.parse(stripBom(readFileSync(path, 'utf8')));
}

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function isTextFile(path) {
  return ['.html', '.css', '.js', '.json', '.md', '.mjs', '.yml', '.yaml', '.webmanifest', '.txt']
    .includes(extname(path).toLowerCase());
}

export function findForbidden(text, relPath) {
  const allowLoopback = ALLOW_LOOPBACK.has(relPath);
  const hits = [];
  for (const { name, re } of FORBIDDEN) {
    if (allowLoopback && (name === '回环地址' || name === 'localhost' || name === '旧端口 8765')) continue;
    const m = re.exec(text);
    if (m) hits.push({ name, sample: m[0] });
  }
  return hits;
}

// 解析 WebP 头，返回 {width,height,kind}；不依赖图像库。
export function webpInfo(buf) {
  if (buf.length < 30) throw new Error('WebP 太短');
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('不是 WebP（RIFF/WEBP 头不匹配）');
  }
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
      kind: 'VP8X',
    };
  }
  if (kind === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) throw new Error('VP8 起始码错误');
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, kind: 'VP8' };
  }
  if (kind === 'VP8L') {
    if (buf[20] !== 0x2f) throw new Error('VP8L 签名错误');
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, kind: 'VP8L' };
  }
  throw new Error(`未知 WebP 子格式：${kind}`);
}
