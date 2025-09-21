require('dotenv').config();
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');

function loadSudo() {
  const raw = process.env.SUDO || '';
  return raw.split(',').map(n => n.trim()).filter(n => /^\d+$/.test(n));
}

let SUDO = loadSudo();

function getSudoList() {
  return SUDO;
}

function addSudo(number) {
  if (!SUDO.includes(number)) {
    SUDO.push(number);
    updateEnv();
    reloadEnv();
  }
}

function removeSudo(number) {
  SUDO = SUDO.filter(n => n !== number);
  updateEnv();
  reloadEnv();
}

function reloadEnv() {
  const dotenv = require('dotenv');
  dotenv.config(); // reload .env
  SUDO = loadSudo(); // reload SUDO list
}

function updateEnv() {
  let envContent = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf-8')
    : '';

  if (envContent.includes('SUDO=')) {
    envContent = envContent.replace(/SUDO=.*/g, `SUDO=${SUDO.join(',')}`);
  } else {
    envContent += `\nSUDO=${SUDO.join(',')}`;
  }

  fs.writeFileSync(envPath, envContent);
}

module.exports = {
  PREFIX: process.env.PREFIX || '.',
  BOT_NAME: process.env.BOT_NAME || 'Triger',
  SUDO,
  getSudoList,
  addSudo,
  removeSudo,
  setOwner: (jid) => {
    const num = jid.split('@')[0];
    if (!SUDO.includes(num)) {
      SUDO.push(num);
      updateEnv();
      reloadEnv();
    }
  }
};
