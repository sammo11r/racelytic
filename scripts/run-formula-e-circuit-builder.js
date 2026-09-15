const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const environment = path.join(root, '.venv-formula-e-circuits');
const requirements = path.join(root, 'requirements-formula-e-circuits.txt');
const marker = path.join(environment, '.requirements.sha256');
const environmentPython = process.platform === 'win32'
  ? path.join(environment, 'Scripts', 'python.exe')
  : path.join(environment, 'bin', 'python');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!fs.existsSync(environmentPython)) {
  const bootstrapPython = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  console.log('Preparing the Formula E circuit builder environment...');
  run(bootstrapPython, ['-m', 'venv', environment]);
}

const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(requirements)).digest('hex');
const installedFingerprint = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '';
const importCheck = spawnSync(environmentPython, ['-c', 'import cv2, numpy, PIL'], { cwd: root, stdio: 'ignore' });
if (installedFingerprint !== fingerprint || importCheck.status !== 0) {
  console.log('Installing Formula E circuit builder dependencies...');
  run(environmentPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements]);
  fs.writeFileSync(marker, `${fingerprint}\n`);
}

run(environmentPython, [path.join('scripts', 'build-formula-e-circuit-svgs.py')]);
