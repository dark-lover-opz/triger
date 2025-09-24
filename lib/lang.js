const lang = {
  plugins: {
    ping: {
      desc: 'Check bot responsiveness',
      ping_sent: 'Pinging...',
      pong: {
        format: (ms) => `Pong! ${ms}ms`
      }
    },
    hello: {
      desc: 'Say hello from Triger',
      reply: 'Hello from Triger!'
    }
  }
};

module.exports = lang;
