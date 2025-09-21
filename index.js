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
const config = require('./config');
const pluginsPath = './plugins';
const ENV_PATH = path.join(__dirname, '.env');

// 🔌 Load plugins into array
const plugins = [];
fs.readdirSync(pluginsPath).forEach(file => {
  if (file.endsWith('.js')) {
    try {
      const plugin = require(`${pluginsPath}/${file}`);
      plugins.push(plugin);
      console.log(chalk.green(`✅ Loaded plugin: ${file}`));
    } catch (err) {
      console.log(chalk.red(`❌ Failed to load plugin ${file}: ${err.message}`));
    }
  }
});

// 🔧 Set bot number as OWNER if not already set
function ensureOwner(botJid) {
  const num = botJid.split('@')[0];
  if (!process.env.OWNER || process.env.OWNER !== num) {
    let env = fs.readFileSync(ENV_PATH, 'utf-8');
    const ownerLine = `OWNER=${num}`;
    env = env.includes('OWNER=') ? env.replace(/OWNER=.*/g, ownerLine) : env + `\n${ownerLine}`;
    fs.writeFileSync(ENV_PATH, env);
    require('dotenv').config({ path: ENV_PATH, override: true });
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

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    if (!text || !text.startsWith(config.PREFIX)) return;

    const body = text.trim().slice(config.PREFIX.length);
    const isGroup = msg.key.remoteJid.endsWith('@g.us');

    let effectiveSender;
    if (isGroup) {
      effectiveSender = msg.key.participant || sock.user.id;
    } else {
      const remoteJid = msg.key.remoteJidAlt || msg.key.remoteJid;
      effectiveSender = msg.key.fromMe ? sock.user.id : remoteJid;
    }

    let sender = jidNormalizedUser(effectiveSender);

    // 🔁 Normalize LID JIDs
    if (sender.includes('@lid')) {
      const lidMap = sock.signalRepository?.lidMapping;
      const lidUser = sender.split('@')[0];
      const mapped = lidMap?.getPNForLID(lidUser);
      if (mapped) {
        sender = jidNormalizedUser(`${mapped}@s.whatsapp.net`);
      }
    }

    const senderNum = sender.split('@')[0];
    const isOwner = senderNum === (process.env.OWNER || '').trim();
    const sudoNums = (process.env.SUDO || '').split(',').map(n => n.trim());
    const isSudo = sudoNums.includes(senderNum);
    const isFromBot = msg.key.fromMe;

    // 🔐 Only allow OWNER, SUDO, or bot itself
    if (!isOwner && !isSudo && !isFromBot) return;

    const message = {
      sock,
      msg,
      sender,
      send: async (text) => {
        await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
      }
    };

    for (const plugin of plugins) {
      const match = body.match(new RegExp(`^${plugin.pattern}$`, 'i'));
      if (match) {
        console.log(chalk.blue(`🔍 Matched plugin: ${plugin.pattern}`));
        try {
          await plugin.handler(message, match[1], match[2], body);
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
