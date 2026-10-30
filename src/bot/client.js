const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { handleInteraction } = require('./handlers/interactionHandler');
const { initEventMonitoring, handleVoiceStateUpdate, handleChatMessage } = require('./handlers/eventTracker');
const { initEconomyLogger } = require('./handlers/economyLogger');

function createDiscordBot() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates
        ]
    });

    client.commands = new Collection();
    const commandsDir = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

    const slashCommandsList = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsDir, file);
        try {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                slashCommandsList.push(command.data.toJSON());
            }
        } catch (e) {
            console.error(`[Error cargando comando ${file}]:`, e.message);
        }
    }

    client.once(Events.ClientReady, async () => {
        console.log(`\n==================================================`);
        console.log(`🎖️  [BOT ONLINE]: Autenticado como ${client.user.tag}`);
        console.log(`🛡️  Base de Datos: SQLite Local activa (Host 50GB)`);
        console.log(`==================================================\n`);

        client.user.setPresence({
            activities: [{
                name: 'Comunidades · /help',
                type: ActivityType.Watching
            }],
            status: 'online'
        });

        // Iniciar monitoreo continuo de presencia en eventos
        initEventMonitoring(client);

        // Iniciar logger de auditoría y transacciones contables
        initEconomyLogger(client);

        // Registrar Comandos Slash
        try {
            const token = process.env.DISCORD_TOKEN;
            const clientId = process.env.CLIENT_ID || client.user.id;

            if (token && clientId) {
                const rest = new REST({ version: '10' }).setToken(token);

                const registration = await require('./registerCommands').registerCommands(rest, clientId, slashCommandsList);
                console.log(`[Slash Commands] ${slashCommandsList.length} comandos registrados: ${registration.scope}.`);
            }
        } catch (err) {
            console.error('[Slash Commands Error]:', err);
        }
    });

    client.on('interactionCreate', async (interaction) => {
        try {
            await handleInteraction(interaction, client, client.commands);
        } catch (error) {
            console.error('[Interaction]', { code: error.code, customId: interaction.customId,
                ageMs: Date.now() - interaction.createdTimestamp, message: error.message });
            if ([10062, 40060].includes(error.code)) return;
            const payload = { content: '⚠️ No pude completar la acción. Vuelve a abrir el panel y reintenta.', flags: 64 };
            if (interaction.deferred) await interaction.editReply({ content: payload.content }).catch(() => {});
            else if (!interaction.replied) await interaction.reply(payload).catch(() => {});
        }
    });

    client.on('voiceStateUpdate', (oldState, newState) => {
        handleVoiceStateUpdate(oldState, newState);
    });

    client.on('messageCreate', (message) => {
        handleChatMessage(message);
    });

    return client;
}

module.exports = { createDiscordBot };
