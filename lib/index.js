const fs = require('fs');
const path = require('path');

async function getPlugins() {
  const pluginDir = path.join(__dirname, '../plugins');
  const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));
  const plugins = [];

  for (const file of files) {
    try {
      const plugin = require(path.join(pluginDir, file));

      if (
        plugin &&
        typeof plugin.regex === 'object' &&
        typeof plugin.handler === 'function'
      ) {
        plugins.push({
          name: plugin.name || file.replace('.js', ''),
          regex: plugin.regex,
          handler: plugin.handler,
          fromMe: plugin.fromMe || false
        });
      } else {
        console.warn(`⚠️ Skipped plugin ${file}: missing regex or handler`);
      }
    } catch (err) {
      console.error(`❌ Failed to load plugin ${file}:`, err);
    }
  }

  return plugins;
}

module.exports = { getPlugins };
