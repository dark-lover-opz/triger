const { bot, lang } = require('../lib');

bot(
  {
    pattern: 'ping ?(.*)',
    desc: lang.plugins.ping.desc,
    type: 'misc',
    fromMe: false // ✅ Allow OWNER and SUDO to use
  },
  async (message, match) => {
    const start = Date.now();
    await message.send(lang.plugins.ping.ping_sent);
    const end = Date.now();
    await message.send(lang.plugins.ping.pong.format(end - start));
  }
);
