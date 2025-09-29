const {
  default: makeWASocket,
  useMultiFileAuthState,
  useSingleFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const pino = require('pino');
require('dotenv').config();

const getConfig = require('./config');
const { reloadEnv } = require('./config');
const { loadPlugins, handleMessage } = require('./lib');
const { fixJid } = require('./lib/utils');
const { attachRetryHandler } = require('./lib/functions');

// 🔥 Autoload plugins
loadPlugins();

// =======================
// Ensure OWNER
// =======================
function ensureOwner(botJid) {
  const num = botJid.split('@')[0];
  const config = getConfig();
  if (!config.OWNER || config.OWNER !== num) {
    fs.appendFileSync(path.join(__dirname, '.env'), `\nOWNER=${num}`);
    reloadEnv();
    console.log(chalk.green(`✅ Bot number set as OWNER: ${num}`));
  }
}

// =======================
// Start Bot
// =======================
async function startBot() {
  const { version } = await fetchLatestBaileysVersion();

  let state, saveCreds;

  if (process.env.SESSION_ID && process.env.SESSION_ID.trim() !== '') {
    const authFile = path.join(__dirname, 'session.json');
    fs.writeFileSync(authFile, process.env.SESSION_ID, 'utf8');
    ({ state, saveCreds } = useSingleFileAuthState(authFile));
    console.log(chalk.green('✅ Using SESSION_ID from .env'));
  } else {
    ({ state, saveCreds } = await useMultiFileAuthState('./auth'));
    console.log(chalk.yellow('📂 Using multi-file auth (auth folder)'));
  }

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
    getMessage: async (key) => {
      return { conversation: "Baileys fallback message" };
    }
  });

  attachRetryHandler(sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages || messages.length === 0) return;
    let msg = messages[0];
    if (!msg.message) return;

    msg.key.remoteJid = await fixJid(msg.key.remoteJid);
    if (msg.key.participant) msg.key.participant = await fixJid(msg.key.participant);
    if (msg.key.senderPn) msg.key.senderPn = await fixJid(msg.key.senderPn);

    try {
      await handleMessage(msg, sock);
    } catch (err) {
      console.error('❌ handleMessage error:', err);
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !process.env.SESSION_ID) {
      console.log(chalk.yellow('📱 Scan this QR to connect:'));
      console.log(qr);
    }

    if (connection === 'open') {
      const botJid = await fixJid(sock.user?.id);
      if (botJid) {
        ensureOwner(botJid);
        console.log(chalk.blue(`🤖 Triger is online as ${botJid}`));
        console.log(chalk.green('✅ Connection established.'));
      } else {
        console.log(chalk.red('❌ Failed to detect bot number'));
      }
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log(chalk.yellow('🔒 Logged out. Delete auth/session and re-scan or set SESSION_ID.'));
        process.exit();
      } else {
        console.log(chalk.red(`⚠️ Connection closed: ${reason}. Reconnecting...`));
        startBot();
      }
    }
  });

  const originalSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const fixed = await fixJid(jid);
    return originalSend(fixed, content, options);
  };
}

startBot();
