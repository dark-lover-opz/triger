const { bot, lang } = require('../lib/')
const { getConfig, setConfig } = require('../configCache')

bot(
  {
    pattern: 'setvar (\\w+)[=\\s]+(.+)',
    desc: 'Set a variable in .env',
    type: 'admin'
  },
  async (message, match) => {
    const [key, value] = match.slice(1)
    setConfig(key, value)
    await message.send(lang.plugins.env.set(key, value))
  }
)

bot(
  {
    pattern: 'getvar (\\w+)',
    desc: 'Get a variable from .env',
    type: 'admin'
  },
  async (message, match) => {
    const key = match[1]
    const value = getConfig()[key]
    if (value === undefined) {
      return await message.send(lang.plugins.env.notFound(key))
    }
    await message.send(lang.plugins.env.get(key, value))
  }
)

bot(
  {
    pattern: 'allvar',
    desc: 'List all .env variables',
    type: 'admin'
  },
  async (message) => {
    const config = getConfig()
    const safe = Object.entries(config)
      .filter(([k]) => !k.startsWith('AUTH') && !k.startsWith('SESSION'))
      .map(([k, v]) => `${k}=${v}`)
    await message.send(lang.plugins.env.all(safe.join('\n')))
  }
)
