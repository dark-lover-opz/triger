const { bot } = require('../lib/bot');

bot(
  {
    pattern: 'hello',
    desc: 'Responds with a greeting',
    type: 'misc',
    fromMe: false
  },
  async (message) => {
    await message.send('👋 Hello! Triger is online and ready.');
  }
);
