const { jidNormalizedUser } = require('baileys')

// Normalize JID (lid → s.whatsapp.net)
async function fixJid(jid = '') {
  if (!jid) return jid
  if (jid.endsWith('@lid')) {
    const num = jid.split('@')[0]
    return `${num}@s.whatsapp.net`
  }
  return await jidNormalizedUser(jid)
}

async function getSender(message, client) {
  const key = message.key || {}
  let senderJid = key.senderPn || key.participant || key.remoteJid
  senderJid = await fixJid(senderJid)

  return {
    sender: senderJid,
    fromMe: (await fixJid(senderJid)) === (await fixJid(client?.user?.id))
  }
}

module.exports = { fixJid, getSender }
