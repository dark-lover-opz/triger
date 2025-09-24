function normalizeJid(jid = '') {
  return jid.replace(/[^0-9]/g, '');
}

function getSender(message, client) {
  const key = message.key || {};
  const senderLid = key.senderPn || key.participant || key.remoteJid;
  const sender = normalizeJid(senderLid);
  const fromMe = normalizeJid(senderLid) === normalizeJid(client?.user?.id);
  return { sender, fromMe };
}

module.exports = { normalizeJid, getSender };
