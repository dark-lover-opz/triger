const plugins = [];

/**
 * Registers a plugin with pattern matching and handler logic.
 * @param {Object} info - Plugin metadata (name, pattern, fromMe, etc.)
 * @param {Function} handler - Function to execute when pattern matches
 */
function bot(info, handler) {
  if (!info?.pattern || typeof handler !== 'function') {
    console.warn('⚠️ Invalid plugin registration:', info);
    return;
  }

  const regex = new RegExp(`^${info.pattern}$`, 'i');
  plugins.push({ ...info, handler, regex });
  console.log(`📦 Registered plugin: ${info.pattern}`);
}

/**
 * Returns all registered plugins.
 * Each plugin includes: { name, pattern, fromMe, handler, regex }
 */
function getPlugins() {
  return plugins;
}

module.exports = { bot, getPlugins };
