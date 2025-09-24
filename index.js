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

// ✅ Correct config import
const getConfig = require('./config')
const { reloadEnv } = require('./config')

// ✅ Import bot framework
const { loadPlugins, handleMessage } = require('./lib')

// 🔥 Autoload all plugins from plugins/
loadPlugins()

// =======================
// Ensure OWNER is set
// =======================
function ensureOwner(botJid) {
  const num = botJid.split('@')[0]
  const config = getConfig()
  if (!config.OWNER || config.OWNER !== num) {
    // direct update (simple)
    fs.appendFileSync(path.join(__dirname, '.env'), `\nOWNER=${num}`)
    reloadEnv()
    console.log(chalk.green(`✅ Bot number set as OWNER: ${num}`))
  }
}

// =======================
// JID Normalizer
// =======================
function normalizeJid(jid = '') {
  return jid.replace(/[^0-9]/g, '')
}

async function fixSenderJid(sock, jid) {
  if (!jid) return jid
  if (jid.endsWith('@lid')) {
    const num = jid.split('@')[0]
    return `${num}@s.whatsapp.net`
  }
  return await jidNormalizedUser(jid)
}

// =======================
// Start the bot
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
    getMessage: async () => undefined
  })

  sock.ev.on('creds.update', saveCreds)

  // 🔥 MAIN HANDLER
  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages || messages.length === 0) return
    const msg = messages[0]
    if (!msg.message) return

    // Pass into universal handler
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
      const botJid = await jidNormalizedUser(sock.user?.id)
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
}

startBot()
