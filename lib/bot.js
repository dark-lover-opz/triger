const plugins = [];

function bot(info, handler) {
  console.log(`📦 Registered plugin: ${info.pattern}`);
  plugins.push({ ...info, handler });
}

function getPlugins() {
  return plugins;
}

module.exports = { bot, getPlugins };
