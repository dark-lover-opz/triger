const { getSender } = require('./utils')
const { getConfig } = require('../config')
const plugins = []

function bot(info, handler) {
  plugins.push({ info, handler })
}

async function handleMessage(message, client) {
  const { sender, fromMe } = await getSender(message, client)
  const body =
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    ''
  const config = getConfig()

  for (const plugin of plugins) {
    const { pattern, fromMe: pluginFromMe } = plugin.info
    const regex = new RegExp(`^${config.PREFIX}${pattern}`, 'i')
    const match = body.match(regex)

    if (!match) continue
    if (pluginFromMe && !fromMe) continue

    try {
      await plugin.handler({ ...message, sender, fromMe, body }, match)
    } catch (err) {
      console.error(`[Plugin Error] ${plugin.info.pattern}:`, err)
    }
  }
}

module.exports = { bot, handleMessage }
