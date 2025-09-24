const { bot } = require('../lib/bot'); // ✅ Correct import
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../configCache');
const ENV_PATH = path.join(__dirname, '../.env');

function reloadEnv() {
  require('dotenv').config({ path: ENV_PATH, override: true });
}

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
  loadConfig();
}

function extractNumber(message, match) {
  let number = match[1] || match[2];
  const context = message.msg?.extendedTextMessage?.contextInfo;

  if (!number && context?.participant) {
    number = context.participant.split('@')[0];
  }

  if (!number && context?.remoteJid && context?.quotedMessage) {
    number = context.remoteJid.split('@')[0];
  }

  if (!number && context?.quotedMessage?.key?.participant) {
    number = context.quotedMessage.key.participant.split('@')[0];
  }

  if (!number && context?.mentionedJid?.length) {
    const jid = context.mentionedJid[0];
    number = jid.split('@')[0];
  }

  if (number?.startsWith('@')) number = number.slice(1);
  return number;
}

bot(
  {
    pattern: 'sudolist|addsudo(?:\\s+(@?\\d+))?|delsudo(?:\\s+(@?\\d+))?',
    desc: 'Manage sudo users',
    type: 'admin',
    fromMe: false
  },
  async (message, match) => {
    const body = message.body.toLowerCase();
    const command = body.startsWith('addsudo') ? 'add' :
                    body.startsWith('delsudo') ? 'remove' : 'list';

    const number = extractNumber(message, match);
    const sudoList = getSudoList();

    if (command === 'list') {
      return await message.send(
        sudoList.length ? `👑 SUDO list:\n${sudoList.join('\n')}` : 'No sudo users found.'
      );
    }

    if (!number || !/^\d{10,}$/.test(number)) {
      return await message.send('❌ Provide a valid number, reply to a user, or mention them.');
    }

    if (command === 'add') {
      if (sudoList.includes(number)) {
        return await message.send('✅ Already in sudo list.');
      }
      sudoList.push(number);
      updateSudoList(sudoList);
      return await message.send(`✅ Added to sudo:\n${sudoList.join('\n')}`);
    }

    if (command === 'remove') {
      if (!sudoList.includes(number)) {
        return await message.send('❌ Not found in sudo list.');
      }
      const updated = sudoList.filter(n => n !== number);
      updateSudoList(updated);
      return await message.send(`✅ Removed from sudo:\n${updated.join('\n')}`);
    }
  }
);

bot(
  {
    pattern: 'sudo',
    desc: 'Show sudo command usage',
    type: 'admin',
    fromMe: false
  },
  async (message) => {
    await message.send(
      `👑 SUDO Management Help:\n\n` +
      `• .sudolist\n` +
      `• .addsudo 918xxxxxxxxx\n` +
      `• .delsudo 918xxxxxxxxx\n` +
      `• .addsudo (reply or mention)\n` +
      `• .delsudo (reply or mention)`
    );
  }
);
