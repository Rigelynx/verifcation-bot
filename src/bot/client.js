const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { handleInteraction } = require('./handlers/interactionHandler');

function createDiscordBot() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    client.commands = new Collection();
    const commandFiles = [
        'panel.js',
        'datosUsuario.js',
        'admin.js',
        'moderacion.js'
    ];

    const slashCommandsList = [];

    for (const file of commandFiles) {
        const filePath = path.join(__dirname, 'commands', file);
        if (fs.existsSync(filePath)) {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                slashCommandsList.push(command.data.toJSON());
            }
        }
    }

    client.once('ready', async () => {
        console.log(`\n==================================================`);
        console.log(`🎖️  [BOT USMC ONLINE]: Autenticado como ${client.user.tag}`);
        console.log(`🛡️  Base de Datos: SQLite Local activa (Host 50GB)`);
        console.log(`==================================================\n`);

        client.user.setPresence({
            activities: [{
                name: 'Cuartel General // /panel-verificacion',
                type: ActivityType.Watching
            }],
            status: 'online'
        });

        // Registrar Comandos Slash
        try {
            const token = process.env.DISCORD_TOKEN;
            const clientId = process.env.CLIENT_ID || client.user.id;
            const guildId = process.env.GUILD_ID;

            if (token && clientId) {
                const rest = new REST({ version: '10' }).setToken(token);

                if (guildId) {
                    console.log(`[Slash Commands] Registrando ${slashCommandsList.length} comandos en el servidor ${guildId}...`);
                    await rest.put(
                        Routes.applicationGuildCommands(clientId, guildId),
                        { body: slashCommandsList }
                    );
                    console.log(`[Slash Commands] ¡Comandos registrados de inmediato en el servidor!`);
                } else {
                    console.log(`[Slash Commands] Registrando ${slashCommandsList.length} comandos globales...`);
                    await rest.put(
                        Routes.applicationCommands(clientId),
                        { body: slashCommandsList }
                    );
                    console.log(`[Slash Commands] ¡Comandos globales registrados!`);
                }
            }
        } catch (err) {
            console.error('[Slash Commands Error]:', err);
        }
    });

    client.on('interactionCreate', async (interaction) => {
        await handleInteraction(interaction, client, client.commands);
    });

    return client;
}

module.exports = { createDiscordBot };
