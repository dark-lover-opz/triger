const { bot, lang } = require('../lib');

bot(
  {
    pattern: 'hello',
    desc: lang.plugins.hello.desc,
    type: 'fun',
  },
  async (message) => {
    return await message.send(lang.plugins.hello.reply);
  }
);
