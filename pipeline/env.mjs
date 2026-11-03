// 从工作区根目录读 .env（只解析 KEY=VALUE，无依赖）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let env = {};
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
  }
}
export const ROOT_DIR = ROOT;
export const YT_API_KEY = env.YT_API_KEY || '';
