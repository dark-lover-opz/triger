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
const chalk = require('chalk');
const { getConfig, setConfig } = require('./configCache');
const { getCommand } = require('./lib/bot'); // ✅ Correct import
const ENV_PATH = path.join(__dirname, '.env');

// 🔌 Load all plugins
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
    auth: state,
    defaultQueryTimeoutMs: undefined,
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
    const usedPrefix = prefixes.find(p => text.startsWith(p));
    if (!usedPrefix) return;

    const body = text.trim().slice(usedPrefix.length);
    const command = body.split(' ')[0].toLowerCase();
    const plugin = getCommand(command);
    if (!plugin) return;

    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    let effectiveSender = isGroup ? msg.key.participant || sock.user.id : msg.key.fromMe ? sock.user.id : msg.key.remoteJid;
    let sender = jidNormalizedUser(effectiveSender);

    if (sender.includes('@lid')) {
      const lidMap = sock.signalRepository?.lidMapping;
      const lidUser = sender.split('@')[0];
      const mapped = lidMap?.getPNForLID(lidUser);
      if (mapped) sender = jidNormalizedUser(`${mapped}@s.whatsapp.net`);
    }

    const senderNum = sender.split('@')[0];
    const isOwner = senderNum === (config.OWNER || '').trim();
    const sudoNums = (config.SUDO || '').split(',').map(n => n.trim());
    const isSudo = sudoNums.includes(senderNum);
    const isFromBot = msg.key.fromMe;

    const allow = plugin.fromMe ? (isFromBot || isOwner) : (isOwner || isSudo || isFromBot);
    if (!allow) {
      console.log(chalk.gray(`⛔ Skipped command: ${command} (not allowed)`));
      return;
    }

    const message = {
      sock,
      msg,
      sender,
      body,
      send: async (text) => {
        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
      }
    };

    console.log(chalk.blue(`🔍 Matched command: ${command}`));
    try {
      await plugin.handler(message);
    } catch (err) {
      console.log(chalk.red(`⚠️ Error in command ${command}: ${err.message}`));
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
