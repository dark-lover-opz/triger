const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { getConfig, setConfig } = require('./configCache');
const { getPlugins } = require('./lib');

// 🔌 Load plugins
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
    printQRInTerminal: true,
    browser: ['TrigerBot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: true,
    getMessage: async () => undefined
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const config = getConfig();
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    const prefixes = config.PREFIX?.split(',').map(p => p.trim()) || ['.'];
    const usedPrefix = prefixes.find(p => text.toLowerCase().startsWith(p.toLowerCase()));
    if (!usedPrefix) return;

    const rawBody = text.trim().slice(usedPrefix.length).trim();
    const isGroup = msg.key.remoteJid.endsWith('@g.us');

    let effectiveSender = isGroup
      ? msg.key.participant || sock.user.id
      : msg.key.fromMe
        ? sock.user.id
        : msg.key.remoteJidAlt || msg.key.remoteJid;

    let sender = await jidNormalizedUser(effectiveSender);

    if (sender.includes('@lid')) {
      const lidMap = sock.signalRepository?.lidMapping;
      const lidUser = sender.split('@')[0];
      const mapped = lidMap?.getPNForLID(lidUser);
      if (mapped) {
        sender = await jidNormalizedUser(`${mapped}@s.whatsapp.net`);
      }
    }

    const senderNum = sender.split('@')[0];
    const isOwner = senderNum === (config.OWNER || '').trim();
    const sudoNums = (config.SUDO || '').split(',').map(n => n.trim());
    const isSudo = sudoNums.includes(senderNum);
    const isFromBot = msg.key.fromMe;

    const message = {
      sock,
      msg,
      sender,
      body: rawBody,
      send: async (text) => {
        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
      }
    };

    for (const plugin of getPlugins()) {
      const match = plugin.regex.exec(rawBody);
      if (match) {
        const allow = plugin.fromMe ? (isFromBot || isOwner) : (isOwner || isSudo || isFromBot);
        if (!allow) {
          console.log(chalk.gray(`⛔ Skipped plugin: ${plugin.pattern} (not allowed)`));
          return;
        }

        console.log(chalk.blue(`🔍 Matched plugin: ${plugin.pattern}`));
        try {
          await plugin.handler(message, match[1], match[2], rawBody);
        } catch (err) {
          console.log(chalk.red(`⚠️ Error in plugin ${plugin.pattern}: ${err.message}`));
        }
        break;
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
