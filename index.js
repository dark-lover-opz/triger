const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore
} = require('baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const pino = require('pino');
const { getConfig, setConfig } = require('./configCache');
const { getPlugins } = require('./lib');

// Load all plugins
fs.readdirSync('./plugins').forEach(file => {
  if (file.endsWith('.js')) require(`./plugins/${file}`);
});

function ensureOwner(botJid) {
  const num = botJid.split('@')[0];
  if (!getConfig().OWNER || getConfig().OWNER !== num) {
    setConfig('OWNER', num);
    console.log(chalk.green(`✅ Bot number set as OWNER: ${num}`));
  }
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth');

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
  });

  sock.ev.on('creds.update', saveCreds);

  const processed = new Set();
  setInterval(() => processed.clear(), 10 * 60 * 1000); // Cleanup every 10 minutes

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages || messages.length === 0) return;
    const msg = messages[0];
    if (!msg.message) return;

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption || '';

    const usedPrefix = '!';
    const rawBody = text.trim().startsWith(usedPrefix)
      ? text.trim().slice(usedPrefix.length).trim()
      : null;
    if (!rawBody) return;

    let chatJid = msg.key.remoteJid;
    const isGroup = !!chatJid && chatJid.endsWith('@g.us');
    let effectiveSenderRef = isGroup ? msg.key.participant || msg.participant : chatJid;
    let sender = await jidNormalizedUser(effectiveSenderRef);
    let originalSenderNum = (sender || '').split('@')[0];
    const botJid = await jidNormalizedUser(sock.user?.id);

    // LID Mapping
    if (sender?.includes('@lid')) {
      console.log(`Attempting LID mapping for ${sender}`);
      const lidMap = sock.signalRepository?.lidMapping;
      const lidUser = sender.split('@')[0];
      if (lidMap?.getPNForLID) {
        const mapped = lidMap.getPNForLID(lidUser);
        if (mapped) {
          originalSenderNum = mapped;
          sender = await jidNormalizedUser(`${mapped}@s.whatsapp.net`);
          chatJid = sender;
          console.log(`✅ Mapped LID ${lidUser} to ${mapped}@s.whatsapp.net`);
        } else {
          console.log(`❌ No mapping found for LID ${lidUser}`);
        }
      } else {
        console.log(`⚠️ lidMap or getPNForLID missing`);
      }
    }

    const normalizedChatJid = await jidNormalizedUser(chatJid);
    const config = getConfig();
    const isOwner = originalSenderNum === (config.OWNER || '').trim();
    const sudoNums = (config.SUDO || '').split(',').map(n => n.trim()).filter(Boolean);
    const isSudo = sudoNums.includes(originalSenderNum);
    const isFromBot = !!msg.key.fromMe;

    const message = {
      sock,
      msg,
      sender,
      body: rawBody,
      send: async (text) => {
        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
      },
    };

    for (const plugin of getPlugins()) {
      const match = plugin.regex.exec(rawBody);
      if (!match) continue;

      const allow = () => {
        if (normalizedChatJid === botJid && (isOwner || isSudo)) return true;
        if (plugin.fromMe) return isFromBot || isOwner;
        return isOwner || isSudo || isFromBot;
      };

      if (!allow()) {
        console.warn(`⛔ Skipped plugin: ${plugin.regex} (not allowed)`);
        continue;
      }

      try {
        await plugin.handler(message, match);
      } catch (err) {
        console.error(`❌ Plugin ${plugin.name} failed: ${err}`);
      }
    }
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log(chalk.yellow('📱 Scan this QR to connect:'));
      console.log(qr);
    }

    if (connection === 'open') {
      const botJid = await jidNormalizedUser(sock.user?.id);
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
        console.log(chalk.yellow('🔒 Logged out. Delete auth folder and re-scan QR.'));
        process.exit();
      } else {
        console.log(chalk.red(`⚠️ Connection closed: ${reason}. Reconnecting...`));
        startBot();
      }
    }
  });
}

startBot();
