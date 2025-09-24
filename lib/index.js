// Core bot registration and plugin loader
const { bot, getPlugins } = require('./bot');

// Language pack or localization module
const lang = require('./lang');

// Export unified bot interface
module.exports = {
  bot,
  getPlugins,
  lang
};
