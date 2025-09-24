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

function normalizeJid(jid = '') {
  return jid.replace(/[^0-9]/g, '');
}

// 🔧 Fix helper: normalize @lid JIDs into @s.whatsapp.net
async function fixSenderJid(sock, jid) {
  if (!jid) return jid;
  if (jid.endsWith('@lid')) {
    const num = jid.split('@')[0];
    return `${num}@s.whatsapp.net`;
  }
  return await jidNormalizedUser(jid);
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
  setInterval(() => processed.clear(), 10 * 60 * 1000);

  // 🔥 MAIN HANDLER
  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages || messages.length === 0) return;
    const msg = messages[0];
    if (!msg.message) return;

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption || '';

    const usedPrefix = getConfig().PREFIX || '!';
    const rawBody = text.trim().startsWith(usedPrefix)
      ? text.trim().slice(usedPrefix.length).trim()
      : null;

    if (!rawBody) {
      console.log('⛔ Message does not match prefix or is empty:', text);
      return;
    }

    let chatJid = msg.key.remoteJid;
    const isGroup = !!chatJid && chatJid.endsWith('@g.us');

    // detect sender properly
    let effectiveSenderRef = isGroup
      ? msg.key.participant || msg.participant
      : msg.key.fromMe
        ? sock.user.id
        : chatJid;

    // ✅ Fix: normalize sender/chat (force @lid → @s.whatsapp.net)
    let sender = await fixSenderJid(sock, effectiveSenderRef);
    let chatIdFixed = await fixSenderJid(sock, chatJid);

    let originalSenderNum = normalizeJid(sender);
    const botJid = await jidNormalizedUser(sock.user?.id);

    const normalizedChatJid = await jidNormalizedUser(chatIdFixed);
    const config = getConfig();
    const isOwner = originalSenderNum === normalizeJid(config.OWNER || '');
    const sudoNums = (config.SUDO || '').split(',').map(n => normalizeJid(n)).filter(Boolean);
    const isSudo = sudoNums.includes(originalSenderNum);
    const isFromBot = normalizeJid(sender) === normalizeJid(sock.user?.id);

    const message = {
      sock,
      msg,
      sender,
      body: rawBody,
      send: async (text) => {
        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
      },
    };

    // Debug log
    console.log({
      botJid,
      sender,
      originalSenderNum,
      isOwner,
      isSudo,
      isFromBot,
      normalizedChatJid,
      chatJid: chatIdFixed,
      rawBody
    });

    const plugins = await getPlugins();
    for (const plugin of plugins) {
      if (!plugin.regex || typeof plugin.handler !== 'function') {
        console.warn(`⚠ Skipped plugin ${plugin.name || 'unknown'}: missing regex or handler`);
        continue;
      }

      const match = plugin.regex.exec(rawBody);
      if (!match) continue;

      // private bot mode: only owner/sudo
      const allow = () => {
        return isOwner || isSudo;
      };

      if (!allow()) {
        console.warn(`⛔ Skipped plugin: ${plugin.regex} (sender not allowed)`);
        console.log({
          sender,
          originalSenderNum,
          isOwner,
          isSudo,
          chatJid: chatIdFixed,
          rawBody
        });
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
