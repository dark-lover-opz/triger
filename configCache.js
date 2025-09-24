const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.join(__dirname, '.env');
let config = {};

function loadConfig() {
  if (!fs.existsSync(ENV_PATH)) return;

  dotenv.config({ path: ENV_PATH, override: true });

  const raw = fs.readFileSync(ENV_PATH, 'utf-8');
  config = {};

  raw.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length) {
      config[key.trim()] = rest.join('=').trim();
    }
  });
}

function getConfig() {
  return config;
}

function setConfig(key, value) {
  config[key] = value;
  const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n'));
  loadConfig();
}

loadConfig();

module.exports = {
  getConfig,
  setConfig,
  loadConfig
};
