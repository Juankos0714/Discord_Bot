const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});



client.once('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
  if (channel) {
    channel.send("¡Hola desde el bot! 🚀");
  } else {
    console.log("No se encontró el canal.");
  }
});

client.login(DISCORD_TOKEN);
