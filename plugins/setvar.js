const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const CONFIG_PATH = path.join(__dirname, '../config.js');
const ENV_PATH = path.join(__dirname, '../.env');

module.exports = {
  pattern: 'setvar ?(.*)',
  fromMe: true,
  desc: 'Set a config variable',
  type: 'config',

  async handler({ send }, match) {
    if (!match || !match.includes('=')) {
      return await send('Format: .setvar KEY=VALUE (e.g., .setvar PREFIX=#)');
    }

    const [rawKey, rawValue] = match.split('=');
    const key = rawKey.trim().toUpperCase();
    const value = rawValue.trim();

    try {
      // 🔧 Update config.js
      let configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
      const lines = configContent.split('\n');
      let updated = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`${key}:`)) {
          lines[i] = `  ${key}: '${value}',`;
          updated = true;
          break;
        }
      }

      if (!updated) {
        const insertIndex = lines.findIndex(l => l.includes('}'));
        if (insertIndex !== -1) {
          lines.splice(insertIndex, 0, `  ${key}: '${value}',`);
        } else {
          throw new Error('Could not find module.exports closing in config.js');
        }
      }

      fs.writeFileSync(CONFIG_PATH, lines.join('\n'));

      // 🔄 Reload config.js
      delete require.cache[require.resolve('../config')];
      const updatedConfig = require('../config');
      Object.assign(module.exports, updatedConfig);

      // ✅ Optional: sync to .env
      if (fs.existsSync(ENV_PATH)) {
        let envContent = fs.readFileSync(ENV_PATH, 'utf8');
        const envLines = envContent.split('\n');
        let envUpdated = false;

        for (let i = 0; i < envLines.length; i++) {
          if (envLines[i].startsWith(`${key}=`)) {
            envLines[i] = `${key}=${value}`;
            envUpdated = true;
            break;
          }
        }

        if (!envUpdated) envLines.push(`${key}=${value}`);
        fs.writeFileSync(ENV_PATH, envLines.filter(Boolean).join('\n'));
      }

      const reply = key === 'SUDO'
        ? `✅ sudo added = ${value.split(',').map(n => n.trim()).join(', ')}`
        : `✅ Set ${key} = ${value}`;

      return await send(reply);
    } catch (err) {
      console.error('Setvar error:', err);
      return await send('❌ Failed to set var. Check format or permissions.');
    }
  }
};
