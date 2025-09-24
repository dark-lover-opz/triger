const { bot, lang } = require('../lib/')

bot(
  {
    pattern: 'hello',
    desc: lang.plugins.hello.desc,
    type: 'misc'
  },
  async (message) => {
    await message.send(lang.plugins.hello.message)
  }
)
