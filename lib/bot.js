const plugins = [];

function bot(info, handler) {
  const regex = new RegExp(`^${info.pattern}$`, 'i');
  plugins.push({ ...info, handler, regex });
  console.log(`📦 Registered plugin: ${info.pattern}`);
}

function getPlugins() {
  return plugins;
}

module.exports = { bot, getPlugins };
