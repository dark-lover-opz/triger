const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.join(__dirname, '.env');

if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}

const toBool = (x) => x === 'true';

function reloadEnv() {
  if (fs.existsSync(ENV_PATH)) {
    dotenv.config({ path: ENV_PATH, override: true });
  }
}

function getConfig() {
  reloadEnv();
  return {
    VERSION: require('./package.json').version,
    OWNER: process.env.OWNER || '',
    SUDO: process.env.SUDO || '',
    PREFIX: process.env.PREFIX || '!',
    BOT_NAME: process.env.BOT_NAME || 'Triger',
    LOG_MSG: toBool(process.env.LOGS) || false
  };
}

module.exports = getConfig;
module.exports.reloadEnv = reloadEnv;
