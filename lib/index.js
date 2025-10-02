const fs = require('fs')
const path = require('path')
const { fixJid, getSender } = require('./utils') // Changed normalizeJid to fixJid

// =======================
// Core bot system
// =======================
const plugins = []

function bot(info, handler) {
  plugins.push({ info, handler })
}

async function handleMessage(msg, client) {
  const botJid = await fixJid(client?.user?.id) // Changed normalizeJid to fixJid
  const { sender, fromMe } = await getSender(msg, client)
  const body =
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    ''

  for (const plugin of plugins) {
    const { pattern, fromMe: pluginFromMe } = plugin.info
    const regex = new RegExp(`^${process.env.PREFIX || '!'}${pattern}`, 'i')
    const match = body.match(regex)

    if (!match) continue
    if (pluginFromMe && !fromMe) continue

    // ✅ Wrap message with send/reply helpers
    const message = {
      sock: client,
      msg,
      sender,
      fromMe,
      body,
      send: async (text) =>
        client.sendMessage(msg.key.remoteJid, { text }, { quoted: msg }),
      reply: async (text) => {
        // For fromMe messages in groups, ensure quoted participant is botJid
        let quotedMsg = msg
        if (fromMe && msg.key.participant && msg.key.participant.endsWith('@lid')) {
          quotedMsg = {
            ...msg,
            key: { ...msg.key, participant: botJid }
          }
        }
        return client.sendMessage(msg.key.remoteJid, { text }, { quoted: quotedMsg })
      },
    }

    try {
      await plugin.handler(message, match)
    } catch (err) {
      console.error(`[Plugin Error] ${plugin.info.pattern}:`, err)
    }
  }
}

// =======================
// Autoload plugins
// =======================
function loadPlugins() {
  const pluginDir = path.join(__dirname, '../plugins')
  const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'))

  for (const file of files) {
    try {
      require(path.join(pluginDir, file)) // ✅ plugin registers via bot()
      console.log(`✅ Loaded plugin: ${file}`)
    } catch (err) {
      console.error(`❌ Failed to load plugin ${file}:`, err)
    }
  }
}

// =======================
// Language pack
// =======================
const lang = {
  plugins: {
    ping: {
      desc: 'Check bot response time',
      ping_sent: '🏓 Pinging...',
      pong: { format: (ms) => `Pong! ${ms}ms` }
    },
    hello: {
      desc: 'Responds with a greeting',
      message: '👋 Hello! Triger is online and ready.'
    },
    env: {
      set: (k, v) => `✅ Updated ${k}=${v}`,
      get: (k, v) => `📦 ${k}=${v}`,
      notFound: (k) => `❌ ${k} not found`,
      all: (list) => `📦 .env variables:\n\n${list}`
    },
    sudo: {
      list: (arr) =>
        arr.length
          ? `👑 SUDO list:\n${arr.join('\n')}`
          : 'No sudo users found.',
      added: (arr) => `✅ Added to sudo:\n${arr.join('\n')}`,
      removed: (arr) => `✅ Removed from sudo:\n${arr.join('\n')}`,
      help:
        `👑 SUDO Management Help:\n\n` +
        `• .sudolist\n` +
        `• .addsudo 918xxxxxxxxx\n` +
        `• .delsudo 918xxxxxxxxx\n` +
        `• .addsudo (reply or mention)\n` +
        `• .delsudo (reply or mention)`,
      invalid: '❌ Provide a valid number, reply to a user, or mention them.',
      exists: '✅ Already in sudo list.',
      notFound: '❌ Not found in sudo list.'
    }
  }
}

module.exports = {
  bot,
  handleMessage,
  loadPlugins,
  fixJid, // Changed normalizeJid to fixJid
  getSender,
  lang
}