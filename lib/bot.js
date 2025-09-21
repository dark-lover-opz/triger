const commandMap = {};

function bot(info, handler) {
  const command = info.pattern.split(' ')[0].toLowerCase();
  commandMap[command] = { ...info, handler };
  console.log(`📦 Registered command: ${command}`);
}

function getCommand(command) {
  return commandMap[command.toLowerCase()];
}

module.exports = {
  bot,
  getCommand
};
