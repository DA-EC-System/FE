#!/usr/bin/env node
/**
 * Chạy ở máy đúng các bước của .github/workflows/ci.yml (thay cho E2E trên GitHub Actions):
 *   1. pnpm lint, pnpm typecheck, pnpm test
 *   2. Vite dev với mock MSW ở 127.0.0.1:<cổng>, chờ trả 200
 *   3. cypress run (mọi spec ngoài nhóm *-be), rồi tắt Vite
 *
 * pnpm ci:local [--spec <glob,...>] [--browser edge] [--port 5179] [--no-e2e] [--skip-check]
 */
import { spawn, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    spec: { type: 'string' },
    browser: { type: 'string', default: 'electron' },
    port: { type: 'string', default: '5179' },
    'no-e2e': { type: 'boolean', default: false },
    'skip-check': { type: 'boolean', default: false },
  },
});

const isWin = process.platform === 'win32';
const baseUrl = `http://127.0.0.1:${opts.port}`;
const results = [];
let vite = null;

/** Windows cần shell để gọi pnpm.cmd; ghép sẵn thành một chuỗi (Node 24 cảnh báo DEP0190 khi truyền mảng) */
function command(cmd, args) {
  if (!isWin) return [cmd, args];
  const quote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  return [[cmd, ...args].map(quote).join(' '), []];
}

function run(label, cmd, args, env = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    console.log(`\n▶ ${label}: ${cmd} ${args.join(' ')}`);
    const child = spawn(...command(cmd, args), { stdio: 'inherit', shell: isWin, env: { ...process.env, ...env } });
    child.on('exit', (code) => {
      results.push({ label, code: code ?? 1, ms: Date.now() - started });
      resolve(code ?? 1);
    });
  });
}

function startVite() {
  console.log(`\n▶ Vite (mock) ở ${baseUrl}`);
  // detached trên Linux/macOS để tắt được cả nhóm tiến trình; Windows dùng taskkill /T
  vite = spawn(...command('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', opts.port, '--strictPort']), {
    stdio: 'ignore',
    shell: isWin,
    detached: !isWin,
    env: { ...process.env, VITE_USE_MOCKS: 'true' },
  });
}

function stopVite() {
  if (!vite || vite.exitCode !== null) return;
  // Đồng bộ: process.exit ngay sau đó, taskkill bất đồng bộ sẽ không kịp chạy
  if (isWin) spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(-vite.pid, 'SIGTERM');
  vite = null;
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (vite?.exitCode !== null && vite?.exitCode !== undefined) return false;
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // chưa nghe cổng
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function summary() {
  console.log('\n── Tóm tắt ci:local ──');
  for (const r of results) {
    console.log(`${r.code === 0 ? '✔' : '✖'} ${r.label.padEnd(10)} ${(r.ms / 1000).toFixed(0).padStart(5)}s`);
  }
}

async function main() {
  if (!opts['skip-check']) {
    for (const step of ['lint', 'typecheck', 'test']) {
      const code = await run(step, 'pnpm', ['run', step]);
      if (code !== 0) return code;
    }
  }
  if (opts['no-e2e']) return 0;

  startVite();
  const started = Date.now();
  const ready = await waitFor(baseUrl, 120_000);
  results.push({ label: 'vite', code: ready ? 0 : 1, ms: Date.now() - started });
  if (!ready) {
    console.error(`Vite không lên ở ${baseUrl} sau 120 giây (cổng bận thì đổi bằng --port).`);
    return 1;
  }

  const args = [
    'exec',
    'cypress',
    'run',
    '--browser',
    opts.browser,
    '--config',
    `baseUrl=${baseUrl},screenshotOnRunFailure=false,video=false,numTestsKeptInMemory=0`,
  ];
  if (opts.spec) args.push('--spec', opts.spec);
  return run('e2e', 'pnpm', args, { CYPRESS_BASE_URL: baseUrl });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopVite();
    process.exit(130);
  });
}

const code = await main().catch((err) => {
  console.error(err);
  return 1;
});
stopVite();
summary();
process.exit(code);
