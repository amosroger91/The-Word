const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const log = path.join(root, '.dev.log');
['', '.err'].forEach((suffix) => { try { fs.rmSync(log + suffix, { force: true }); } catch {} });

// Kill any lingering dev servers so we get a deterministic port.
try {
  require('child_process').execSync(
    'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match ' +
      "'" +
      'scripts/dev.mjs' +
      "'" +
      ' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
    { encoding: 'utf8', stdio: 'ignore' }
  );
  console.log('killed lingering dev servers');
} catch (e) {
  console.log('nothing to kill');
}

setTimeout(() => {
  const child = spawn('node', ['scripts/dev.mjs'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', fs.openSync(log, 'a'), fs.openSync(log + '.err', 'a')],
  });
  child.unref();
  console.log('started detached dev server PID', child.pid);
}, 1200);