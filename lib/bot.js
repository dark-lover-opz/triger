const plugins = [];

function bot(info, handler) {
  plugins.push({ ...info, handler });
}

function getPlugins() {
  return plugins;
}

module.exports = { bot, getPlugins };
