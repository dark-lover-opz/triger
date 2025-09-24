const { bot, lang } = require('../lib');

bot(
  {
    pattern: 'hello',
    desc: lang.plugins.hello.desc,
    type: 'fun',
    fromMe: false
  },
  async (message, match) => {
    await message.send(lang.plugins.hello.reply);
  }
);
