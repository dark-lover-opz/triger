module.exports = {
  name: 'ping',
  regex: /^ping$/i,
  fromMe: false,
  handler: async (message) => {
    const start = Date.now();
    await message.send('Pinging...');
    const end = Date.now();
    await message.send(`Pong! ${end - start}ms`);
  }
};
