const { jidNormalizedUser } = require('baileys')

function normalizeJid(jid = '') {
  return jid.replace(/[^0-9]/g, '')
}

async function getSender(message, client) {
  const key = message.key || {}
  let senderJid = key.senderPn || key.participant || key.remoteJid

  if (senderJid && senderJid.endsWith('@lid')) {
    senderJid = `${senderJid.split('@')[0]}@s.whatsapp.net`
  }

  const normalizedJid = await jidNormalizedUser(senderJid)

  return {
    sender: normalizedJid,
    fromMe: normalizeJid(normalizedJid) === normalizeJid(client?.user?.id)
  }
}

module.exports = { normalizeJid, getSender }
