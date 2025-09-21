const { jidDecode, downloadContentFromMessage, getContentType, normalizeMessageContent, jidNormalizedUser, getDevice } = require('@whiskeysockets/baileys');
const fs = require('fs');
const config = require('../config');
const events = require('./bot');
const { Message } = require('./BASE/');

const handledMessages = new Set();

const downloadMedia = (message, pathFile) =>
  new Promise(async (resolve, reject) => {
    let type = Object.keys(message)[0];
    let mimeMap = {
      imageMessage: "image",
      videoMessage: "video",
      stickerMessage: "sticker",
      documentMessage: "document",
      audioMessage: "audio",
    };
    let mes = message;
    if (type == "templateMessage") {
      mes = message.templateMessage.hydratedFourRowTemplate;
      type = Object.keys(mes)[0];
    }
    if (type === "interactiveResponseMessage") {
      mes = message.interactiveResponseMessage;
      type = Object.keys(mes)[0];
    }
    if (type == "buttonsMessage") {
      mes = message.buttonsMessage;
      type = Object.keys(mes)[0];
    }
    try {
      const stream = await downloadContentFromMessage(mes[type], mimeMap[type]);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      if (pathFile) {
        await fs.promises.writeFile(pathFile, buffer);
        resolve(pathFile);
      } else {
        resolve(buffer);
      }
    } catch (e) {
      reject(e);
    }
  });

function decodeJid(jid) {
  if (/:\d+@/gi.test(jid)) {
    const decode = jidDecode(jid) || {};
    return (
      (decode.user && decode.server && decode.user + "@" + decode.server) ||
      jid
    ).trim();
  } else return jid;
}

async function msgUpsert(type, messages, sock) {
  if (type !== 'notify') return;

  for (const m of messages) {
    if (!m.message) continue;

    if (handledMessages.has(m.key.id)) continue;
    handledMessages.add(m.key.id);
    setTimeout(() => handledMessages.delete(m.key.id), 60_000);

    const msg = {};
    msg.message = normalizeMessageContent(m.message);
    msg.key = m.key;
    msg.name = m.pushName;
    msg.prefix = config.PREFIX;
    msg.creator = 'spark-shadow';
    msg.botName = config.BOT_NAME;
    msg.toJid = m.key.remoteJid;
    msg.id = m.key.id;
    msg.device = getDevice(m.key.id);
    msg.isGroup = m.key.remoteJid.endsWith('@g.us');

    let effectiveSender;
    if (msg.isGroup) {
      effectiveSender = m.key.participant || sock.user.id;
    } else {
      const remoteJid = m.key.remoteJidAlt || m.key.remoteJid;
      effectiveSender = m.key.fromMe ? sock.user.id : remoteJid;
    }
    msg.sender = jidNormalizedUser(effectiveSender);

    const [senderUser, senderServer] = msg.sender.split('@');
    if (senderServer === 'lid') {
      const pn = sock.signalRepository.lidMapping.getPNForLID(senderUser);
      if (pn) {
        msg.sender = jidNormalizedUser(`${pn}@s.whatsapp.net`);
      }
    }

    msg.type = getContentType(m.message);
    try {
      msg.mentions = msg.message[msg.type]?.contextInfo?.mentionedJid || [];
    } catch {
      msg.mentions = false;
    }

    msg.text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.templateButtonReplyMessage?.selectedId ||
      '';

    const senderNum = msg.sender.split('@')[0];
    const sudoNumbers = config.SUDO.map(jid => jid.split('@')[0]);
    msg.sudo = sudoNumbers.includes(senderNum) || (msg.sender === jidNormalizedUser(sock.user.id));

    if (typeof msg.text === 'string' && msg.text.length > 0) {
      msg.text = msg.text.toLowerCase();
      for (const command of events.commands) {
        if (
          (command.on && msg.text) ||
          (command.pattern && typeof command.pattern.test === 'function' && command.pattern.test(msg.text))
        ) {
          const isAllowed = command.fromMe ? (msg.sudo || msg.key.fromMe) : true;
          let sendMsg = true;
          if (command.onlyPm && msg.isGroup) sendMsg = false;
          if (command.onlyGroup && !msg.isGroup) sendMsg = false;

          if (sendMsg) {
            let matchGroup = null;
            if (command.pattern && typeof command.pattern.exec === 'function') {
              const match = msg.text.match(command.pattern);
              matchGroup = match && match[1] ? match[1] : null;
            }

            const whats = new Message(sock, msg);
            try {
              await command.function(whats, matchGroup, sock);
            } catch (error) {
              await sock.sendMessage(jidNormalizedUser(sock.user.id), {
                text: `*Bot Error*\n\n${require('util').format(error)}`,
              });
              console.error(error);
            }
          }
        }
      }
    } else {
      console.log('No text found for message type:', msg.type);
    }
  }
}

module.exports = {
  msgUpsert,
  downloadMedia,
  decodeJid
};
