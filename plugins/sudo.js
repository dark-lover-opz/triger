const fs = require('fs');
const path = require('path');
const { reloadEnv } = require('../config');
const ENV_PATH = path.join(__dirname, '../.env');

function getSudoList() {
  reloadEnv();
  const raw = process.env.SUDO || '';
  return raw.split(',').map(n => n.trim()).filter(n => /^\d{10,}$/.test(n));
}

function updateSudoList(list) {
  let env = fs.readFileSync(ENV_PATH, 'utf-8');
  const sudoLine = `SUDO=${list.join(',')}`;
  env = env.includes('SUDO=') ? env.replace(/SUDO=.*/g, sudoLine) : env + `\n${sudoLine}`;
  fs.writeFileSync(ENV_PATH, env);
  reloadEnv();
}

module.exports = {
  pattern: 'listsudo|addsudo(?:\\s+(\\d+))?|removesudo(?:\\s+(\\d+))?',
  fromMe: true,
  desc: 'Manage sudo users',
  type: 'admin',

  async handler({ send, msg }, match1, match2, body) {
    const command = body.startsWith('addsudo') ? 'add' :
                    body.startsWith('removesudo') ? 'remove' : 'list';

    let number = match1 || match2;
    if (!number && msg.message?.extendedTextMessage?.contextInfo?.participant) {
      number = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
    }

    const sudoList = getSudoList();

    if (command === 'list') {
      return await send(sudoList.length ? `👑 sudo added = ${sudoList.join(', ')}` : 'No sudo users found.');
    }

    if (!number || !/^\d{10,}$/.test(number)) {
      return await send('❌ Provide a valid number or reply to a user.');
    }

    if (command === 'add') {
      if (sudoList.includes(number)) return await send('✅ Already in sudo list.');
      sudoList.push(number);
      updateSudoList(sudoList);
      return await send(`✅ sudo added = ${sudoList.join(', ')}`);
    }

    if (command === 'remove') {
      if (!sudoList.includes(number)) return await send('❌ Not found in sudo list.');
      const updated = sudoList.filter(n => n !== number);
      updateSudoList(updated);
      return await send(`✅ sudo updated = ${updated.join(', ')}`);
    }
  }
};
