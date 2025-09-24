const {
  jidDecode,
  downloadContentFromMessage,
  getContentType,
  normalizeMessageContent,
  getDevice
} = require('baileys')
const fs = require('fs')
const config = require('../config')
const { getPlugins } = require('./bot')
const { Message } = require('./BASE/Message')
const { fixJid } = require('./utils')

const handledMessages = new Set()

// =======================
// Download media
// =======================
const downloadMedia = async (message, pathFile) => {
  try {
    let type = Object.keys(message)[0]
    const mimeMap = {
      imageMessage: 'image',
      videoMessage: 'video',
      stickerMessage: 'sticker',
      documentMessage: 'document',
      audioMessage: 'audio'
    }

    let mes = message
    if (type === 'templateMessage') {
      mes = message.templateMessage.hydratedFourRowTemplate
      type = Object.keys(mes)[0]
    } else if (type === 'interactiveResponseMessage') {
      mes = message.interactiveResponseMessage
      type = Object.keys(mes)[0]
    } else if (type === 'buttonsMessage') {
      mes = message.buttonsMessage
      type = Object.keys(mes)[0]
    }

    const stream = await downloadContentFromMessage(mes[type], mimeMap[type])
    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    if (pathFile) {
      await fs.promises.writeFile(pathFile, buffer)
      return pathFile
    } else {
      return buffer
    }
  } catch (e) {
    throw e
  }
}

// =======================
// Decode JID
// =======================
function decodeJid(jid) {
  if (/:\d+@/gi.test(jid)) {
    const decode = jidDecode(jid) || {}
    return (
      (decode.user && decode.server && decode.user + '@' + decode.server) ||
      jid
    ).trim()
  } else return jid
}

// =======================
// Message Upsert
// =======================
async function msgUpsert({ type, messages }, sock) {
  if (type !== 'notify') return

  for (const m of messages) {
    if (!m.message || handledMessages.has(m.key.id)) continue

    handledMessages.add(m.key.id)
    setTimeout(() => handledMessages.delete(m.key.id), 60_000)

    const msg = {}
    msg.message = normalizeMessageContent(m.message)
    msg.key = m.key
    msg.name = m.pushName
    msg.prefix = config.PREFIX
    msg.creator = 'spark-shadow'
    msg.botName = config.BOT_NAME
    msg.toJid = await fixJid(m.key.remoteJid)
    msg.id = m.key.id
    msg.device = getDevice(m.key.id)
    msg.isGroup = msg.toJid.endsWith('@g.us')

    let effectiveSender
    if (msg.isGroup) {
      effectiveSender = m.key.participant || sock.user.id
    } else {
      effectiveSender = m.key.fromMe ? sock.user.id : m.key.remoteJid
    }

    msg.sender = await fixJid(effectiveSender)
    msg.type = getContentType(m.message)
    msg.mentions = msg.message[msg.type]?.contextInfo?.mentionedJid || []

    msg.text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.templateButtonReplyMessage?.selectedId ||
      ''

    // ✅ Fixed sudo check
    const senderNum = msg.sender.split('@')[0].replace(/[^0-9]/g, '')
    const sudoNumbers = (config.SUDO || '')
      .split(',')
      .map(num => num.replace(/[^0-9]/g, ''))

    msg.sudo =
      sudoNumbers.includes(senderNum) ||
      (await fixJid(msg.sender)) === (await fixJid(sock.user.id))

    if (typeof msg.text === 'string' && msg.text.length > 0) {
      msg.text = msg.text.toLowerCase()

      for (const plugin of getPlugins()) {
        const match = plugin.regex.exec(msg.text)
        if (!match) continue

        const isAllowed = plugin.fromMe ? (msg.sudo || msg.key.fromMe) : true
        const sendMsg =
          (!plugin.onlyPm || !msg.isGroup) &&
          (!plugin.onlyGroup || msg.isGroup)

        if (isAllowed && sendMsg) {
          const whats = new Message(sock, msg)
          try {
            await plugin.handler(whats, match, sock)
          } catch (error) {
            await sock.sendMessage(await fixJid(sock.user.id), {
              text: `*Bot Error*\n\n${require('util').format(error)}`
            })
            console.error(error)
          }
        }
      }
    } else {
      console.log('No text found for message type:', msg.type)
    }
  }
}

// =======================
// Retry + Reaction handler
// =======================
function attachRetryHandler(sock) {
  sock.ev.on('message-receipt.update', async (receipt) => {
    if (receipt?.retryCount && receipt.retryCount > 0) {
      console.log('🔁 Retrying decryption for message:', receipt.key?.id)
    }
  })

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.update?.status === 'serverAck') {
        console.log('✅ Message delivered:', update.key?.id)
      }
    }
  })

  sock.ev.on('messages.reaction', async (reactions) => {
    for (const reaction of reactions) {
      const txt = reaction?.reaction?.text
        ? Buffer.isBuffer(reaction.reaction.text)
          ? reaction.reaction.text.toString()
          : reaction.reaction.text
        : ''
      console.log(`💬 Reaction event: ${txt}`)
    }
  })
}

module.exports = {
  msgUpsert,
  downloadMedia,
  decodeJid,
  attachRetryHandler
}
