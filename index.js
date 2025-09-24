const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore
} = require('baileys')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const pino = require('pino')

// ✅ Config import
const getConfig = require('./config')
const { reloadEnv } = require('./config')

// ✅ Bot framework
const { loadPlugins, handleMessage } = require('./lib')
const { fixJid } = require('./lib/utils')
const { attachRetryHandler } = require('./lib/functions')

// 🔥 Autoload plugins
loadPlugins()

// =======================
// Ensure OWNER
// =======================
function ensureOwner(botJid) {
  const num = botJid.split('@')[0]
  const config = getConfig()
  if (!config.OWNER || config.OWNER !== num) {
    fs.appendFileSync(path.join(__dirname, '.env'), `\nOWNER=${num}`)
    reloadEnv()
    console.log(chalk.green(`✅ Bot number set as OWNER: ${num}`))
  }
}

// =======================
// Start Bot
// =======================
async function startBot() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('./auth')

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    },
    logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' }),
    browser: ['TrigerBot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: true,

    // ✅ fallback getMessage so retries don’t fail instantly
    getMessage: async (key) => {
      return { conversation: "Baileys fallback message" }
    }
  })

  // ✅ attach retry handler
  attachRetryHandler(sock)

  sock.ev.on('creds.update', saveCreds)

  // 🔥 Handle messages
  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages || messages.length === 0) return
    let msg = messages[0]
    if (!msg.message) return

    // Normalize JIDs
    msg.key.remoteJid = await fixJid(msg.key.remoteJid)
    if (msg.key.participant) msg.key.participant = await fixJid(msg.key.participant)
    if (msg.key.senderPn) msg.key.senderPn = await fixJid(msg.key.senderPn)

    try {
      await handleMessage(msg, sock)
    } catch (err) {
      console.error('❌ handleMessage error:', err)
    }
  })

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log(chalk.yellow('📱 Scan this QR to connect:'))
      console.log(qr)
    }

    if (connection === 'open') {
      const botJid = await fixJid(sock.user?.id)
      if (botJid) {
        ensureOwner(botJid)
        console.log(chalk.blue(`🤖 Triger is online as ${botJid}`))
        console.log(chalk.green('✅ Connection established.'))
      } else {
        console.log(chalk.red('❌ Failed to detect bot number'))
      }
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      if (reason === DisconnectReason.loggedOut) {
        console.log(chalk.yellow('🔒 Logged out. Delete auth folder and re-scan QR.'))
        process.exit()
      } else {
        console.log(chalk.red(`⚠️ Connection closed: ${reason}. Reconnecting...`))
        startBot()
      }
    }
  })

  // ✅ Auto-fix sendMessage JIDs
  const originalSend = sock.sendMessage.bind(sock)
  sock.sendMessage = async (jid, content, options) => {
    const fixed = await fixJid(jid)
    return originalSend(fixed, content, options)
  }
}

startBot()
