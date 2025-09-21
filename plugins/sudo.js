module.exports = {
  pattern: 'listsudo|addsudo(?:\\s+(\\d+))?|removesudo(?:\\s+(\\d+))?',
  fromMe: true,
  desc: 'Manage sudo users: list, add, remove',
  type: 'admin',

  async handler({ send, msg }, match1, match2) {
    const { getSudoList, addSudo, removeSudo } = require('../config');

    const command = msg.text.startsWith('.addsudo') ? 'add' :
                    msg.text.startsWith('.removesudo') ? 'remove' :
                    'list';

    let number = match1 || match2;

    // ✅ If no number provided, try to get from reply
    if (!number && msg.message?.extendedTextMessage?.contextInfo?.participant) {
      number = msg.message.extendedTextMessage.contextInfo.participant.split('@')[0];
    }

    if (command === 'list') {
      const sudoList = getSudoList();
      if (sudoList.length === 0) return await send('No sudo users found.');
      return await send(`👑 Sudo Users:\n\n${sudoList.map(n => `• ${n}`).join('\n')}`);
    }

    if (!number || !/^\d{10,}$/.test(number)) {
      return await send('❌ Provide a valid number or reply to a user.');
    }

    if (command === 'add') {
      if (getSudoList().includes(number)) return await send('✅ Already in sudo list.');
      addSudo(number);
      return await send(`✅ Added to sudo: ${number}`);
    }

    if (command === 'remove') {
      if (!getSudoList().includes(number)) return await send('❌ Not found in sudo list.');
      removeSudo(number);
      return await send(`✅ Removed from sudo: ${number}`);
    }
  }
};
