const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const chalk = require('chalk');
const { getPlugins } = require('./lib');

const pluginsPath = './plugins';

// 🔌 Load all plugin files
fs.readdirSync(pluginsPath).forEach(file => {
  if (file.endsWith('.js')) {
    try {
      require(`${pluginsPath}/${file}`);
      console.log(chalk.green(`✅ Loaded plugin: ${file}`));
    } catch (err) {
      console.log(chalk.red(`❌ Failed to load plugin ${file}: ${err.message}`));
    }
  }
});

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth');

  const sock = makeWASocket({
    version,
    auth: state,
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    if (!text || !text.startsWith(config.PREFIX)) return;

    const body = text.trim().slice(config.PREFIX.length);

    const isGroup = msg.key.remoteJid.endsWith('@g.us');

    // ✅ Robust sender detection
    let effectiveSender;
    if (isGroup) {
      effectiveSender = msg.key.participant || sock.user.id;
    } else {
      const remoteJid = msg.key.remoteJidAlt || msg.key.remoteJid;
      effectiveSender = msg.key.fromMe ? sock.user.id : remoteJid;
    }

    let sender = jidNormalizedUser(effectiveSender);

    // ✅ Normalize LID JIDs
    if (sender.includes('@lid')) {
      const lidMap = sock.signalRepository?.lidMapping;
      const lidUser = sender.split('@')[0];
      const mapped = lidMap?.getPNForLID(lidUser);
      if (mapped) {
        sender = jidNormalizedUser(`${mapped}@s.whatsapp.net`);
      }
    }

    const botJid = jidNormalizedUser(sock.user.id);
    const senderNum = sender.split('@')[0];
    const sudoNums = config.SUDO.map(jid => jid.split('@')[0]);

    const isFromBot = msg.key.fromMe;
    const isSudo = sudoNums.includes(senderNum);

    // ✅ Allow if:
    // - Message is from bot itself
    // - Sender is sudo
    if (!isFromBot && !isSudo) return;

    const message = {
      sock,
      msg,
      sender,
      send: async (text) => {
        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
      }
    };

    for (const plugin of getPlugins()) {
      const match = body.match(new RegExp(`^${plugin.pattern}$`, 'i'));
      if (match) {
        try {
          await plugin.handler(message, match[1]);
        } catch (err) {
          console.log(chalk.red(`⚠️ Error in plugin ${plugin.pattern}: ${err.message}`));
        }
        break;
      }
    }
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(chalk.yellow('📱 Scan this QR to connect:'));
      console.log(qr);
    }

    if (connection === 'open') {
      const botJid = jidNormalizedUser(sock.user?.id);
      if (botJid) {
        config.setOwner(botJid);
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