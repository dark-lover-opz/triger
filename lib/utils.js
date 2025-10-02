const { jidNormalizedUser } = require('baileys') // Using your custom fork

// Normalize JID (lid → s.whatsapp.net)
async function fixJid(jid = '', isFromMe = false, botJid = '') {
  if (!jid) return jid
  if (jid.endsWith('@lid')) {
    // For fromMe messages, return bot's JID if provided
    if (isFromMe && botJid) {
      return botJid
    }
    const num = jid.split('@')[0]
    return `${num}@s.whatsapp.net`
  }
  return await jidNormalizedUser(jid)
}

async function getSender(message, client) {
  const key = message.key || {}
  const botJid = await fixJid(client?.user?.id)
  let senderJid = key.senderPn || key.participant || key.remoteJid
  senderJid = await fixJid(senderJid, key.fromMe, botJid)

  return {
    sender: senderJid,
    fromMe: key.fromMe || (await fixJid(senderJid)) === botJid
  }
}

module.exports = { fixJid, getSender }