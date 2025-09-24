class Message {
  constructor(sock, msg) {
    this.sock = sock
    this.msg = msg
    this.sender = msg.sender
    this.id = msg.id
    this.isGroup = msg.isGroup
    this.text = msg.text
  }

  async reply(text) {
    return this.sock.sendMessage(this.msg.toJid, { text }, { quoted: this.msg })
  }

  async send(text) {
    return this.sock.sendMessage(this.msg.toJid, { text })
  }
}

module.exports = { Message }
