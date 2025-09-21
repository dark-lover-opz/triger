const { existsSync } = require('fs');
if (existsSync('.env')) require('dotenv').config({ path: '.env' });

const toBool = (x) => x === 'true';

module.exports = {
  VERSION: require('./package.json').version,
  OWNER: process.env.OWNER || '',
  SUDO: process.env.SUDO || '',
  PREFIX: process.env.PREFIX || '.',
  BOT_NAME: process.env.BOT_NAME || 'Triger',
  LOG_MSG: toBool(process.env.LOGS) || false
};
