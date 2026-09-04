const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const log = path.join(root, '.dev-fresh.log');
fs.rmSync(log, { force: true });

// Which ports are already in use?
const net = require('child_process').execSync(
  'powershell -NoProfile -Command "Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(5173,5174,5175,5176) } | ForEach-Object { $_.LocalPort.ToString() + \":\" + $_.OwningProcess }"',
  { encoding: 'utf8' }
);
console.log('ports in use:', net.trim());

// Kill all pre-existing dev.mjs processes so stale servers don't serve old code.
try {
  require('child_process').execSync(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match \'scripts/dev.mjs\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
    { encoding: 'utf8' }
  );
  console.log('killed old dev servers');
} catch (e) {
  console.log('kill error', e.message);
}

setTimeout(() => {
  const child = spawn('node', ['scripts/dev.mjs'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', fs.openSync(log, 'a'), fs.openSync(log + '.err', 'a')],
  });
  child.unref();
  console.log('started fresh dev server PID', child.pid);
}, 1500);