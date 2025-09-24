const { bot } = require('../lib');
const { getConfig, setConfig } = require('../configCache');

bot(
  {
    pattern: 'setvar (\\w+)[=\\s]+(.+)',
    desc: 'Set a variable in .env',
    type: 'admin',
    fromMe: false
  },
  async (message, match) => {
    const [key, value] = match.slice(1);
    setConfig(key, value);
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
  async (message, match) => {
    const key = match[1];
    const value = getConfig()[key];
    if (value === undefined) {
      return await message.send(`❌ ${key} not found`);
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
    const config = getConfig();
    const safe = Object.entries(config)
      .filter(([k]) => !k.startsWith('AUTH') && !k.startsWith('SESSION'))
      .map(([k, v]) => `${k}=${v}`);
    await message.send(`📦 .env variables:\n\n${safe.join('\n')}`);
  }
);
