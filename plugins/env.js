const fs = require('fs');
const path = require('path');
const { bot } = require('../lib');
const ENV_PATH = path.join(__dirname, '../.env');

function reloadEnv() {
  require('dotenv').config({ path: ENV_PATH, override: true });
}

function readEnv() {
  reloadEnv();
  const raw = fs.readFileSync(ENV_PATH, 'utf-8');
  return raw.split('\n').filter(Boolean);
}

function writeEnv(lines) {
  fs.writeFileSync(ENV_PATH, lines.join('\n'));
  reloadEnv();
}

bot(
  {
    pattern: 'setvar (\\w+)[=\\s]+(.+)',
    desc: 'Set a variable in .env',
    type: 'admin',
    fromMe: false
  },
  async (message, key, value) => {
    const lines = readEnv();
    const updated = lines.map(line =>
      line.startsWith(`${key}=`) ? `${key}=${value}` : line
    );
    const exists = lines.some(line => line.startsWith(`${key}=`));
    if (!exists) updated.push(`${key}=${value}`);
    writeEnv(updated);
    await message.send(`✅ Updated ${key}=${value}`);
  }
);

bot(
  {
    pattern: 'getvar (\\w+)',
    desc: 'Get a variable from .env',
    type: 'admin',
    fromMe: false
  },
  async (message, key) => {
    reloadEnv();
    const value = process.env[key];
    if (value === undefined) {
      return await message.send(`❌ ${key} not found in .env`);
    }
    await message.send(`📦 ${key}=${value}`);
  }
);

bot(
  {
    pattern: 'allvar',
    desc: 'List all .env variables',
    type: 'admin',
    fromMe: false
  },
  async (message) => {
    const lines = readEnv();
    const safe = lines.filter(line => !line.startsWith('AUTH') && !line.startsWith('SESSION'));
    await message.send(`📦 .env variables:\n\n${safe.join('\n')}`);
  }
);
