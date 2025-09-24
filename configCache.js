const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.join(__dirname, '.env');
let config = {};

// Load and parse .env file into config object
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

// Get current config snapshot
function getConfig() {
  return config;
}

// Update a key-value pair in .env and reload config
function setConfig(key, value) {
  config[key] = value;

  const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n'));
  loadConfig();
}

// Initial load
loadConfig();

module.exports = {
  getConfig,
  setConfig,
  loadConfig
};
