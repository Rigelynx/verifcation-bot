const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const economyDb = require('../../database/economyDb');
const { hasOfficerPermission } = require('../handlers/permissionHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economia')
        .setDescription('Comandos del sistema financiero y económico militar USMC')
        .addSubcommand(sub =>
            sub.setName('balance')
                .setDescription('Consulta tu balance militar o el de otro recluta')
                .addUserOption(opt => opt.setName('usuario').setDescription('Recluta a consultar').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('depositar')
                .setDescription('Deposita dinero en efectivo a tu caja fuerte bancaria')
                .addStringOption(opt => opt.setName('monto').setDescription('Cantidad numérica o escribe "all" para depositar todo').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('retirar')
                .setDescription('Retira dinero de tu caja fuerte militar a tu cartera')
                .addStringOption(opt => opt.setName('monto').setDescription('Cantidad numérica o escribe "all" para retirar todo').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('pagar')
                .setDescription('Transfiere dinero en efectivo a otro miembro')
                .addUserOption(opt => opt.setName('usuario').setDescription('Recluta receptor').setRequired(true))
                .addIntegerOption(opt => opt.setName('monto').setDescription('Monto a transferir').setMinValue(1).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('trabajar')
                .setDescription('Realiza guardias y labores tácticas para recibir tu salario')
        )
        .addSubcommand(sub =>
            sub.setName('crimen')
                .setDescription('Ejecuta una operación encubierta ilícita con riesgo de sanción')
        )
        .addSubcommand(sub =>
            sub.setName('robar')
                .setDescription('Intenta asaltar la cartera de otro recluta')
                .addUserOption(opt => opt.setName('usuario').setDescription('Objetivo del asalto').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('ranking')
                .setDescription('Muestra el escalafón de los 10 reclutas más acaudalados')
        )
        .addSubcommandGroup(group =>
            group.setName('admin')
                .setDescription('Gestión de fondos para el cuerpo de oficiales y mando')
                .addSubcommand(sub =>
                    sub.setName('dar')
                        .setDescription('Acreditar fondos a un recluta')
                        .addIntegerOption(opt => opt.setName('monto').setDescription('Cantidad').setMinValue(1).setRequired(true))
                        .addUserOption(opt => opt.setName('usuario').setDescription('Recluta (déjalo vacío para acreditarte fondos a ti mismo)').setRequired(false))
                        .addStringOption(opt => opt.setName('destino').setDescription('Destino del saldo').addChoices(
                            { name: 'Cartera (Efectivo)', value: 'wallet' },
                            { name: 'Banco (Caja Fuerte)', value: 'bank' }
                        ).setRequired(false))
                )
                .addSubcommand(sub =>
                    sub.setName('quitar')
                        .setDescription('Retirar fondos a un recluta')
                        .addIntegerOption(opt => opt.setName('monto').setDescription('Cantidad').setMinValue(1).setRequired(true))
                        .addUserOption(opt => opt.setName('usuario').setDescription('Recluta (déjalo vacío para ti mismo)').setRequired(false))
                        .addStringOption(opt => opt.setName('origen').setDescription('Origen a debitar').addChoices(
                            { name: 'Cartera (Efectivo)', value: 'wallet' },
                            { name: 'Banco (Caja Fuerte)', value: 'bank' }
                        ).setRequired(false))
                )
                .addSubcommand(sub =>
                    sub.setName('fijar')
                        .setDescription('Establecer el saldo exacto a un recluta')
                        .addIntegerOption(opt => opt.setName('monto').setDescription('Cantidad fija').setMinValue(0).setRequired(true))
                        .addUserOption(opt => opt.setName('usuario').setDescription('Recluta (déjalo vacío para ti mismo)').setRequired(false))
                        .addStringOption(opt => opt.setName('destino').setDescription('Saldo a fijar').addChoices(
                            { name: 'Cartera (Efectivo)', value: 'wallet' },
                            { name: 'Banco (Caja Fuerte)', value: 'bank' }
                        ).setRequired(false))
                )
        ),

    async execute(interaction) {
        const guildId = interaction.guildId || 'GLOBAL';
        const settings = economyDb.getEconomySettings(guildId);
        const sym = settings.currency_symbol || '$';
        const curName = settings.currency_name || 'Créditos USMC';

        // Sincronizar datos del usuario
        economyDb.syncAccountUser(
            interaction.user.id,
            interaction.user.tag || interaction.user.username,
            interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
        );

        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);

        // ==========================================
        // SUBCOMANDOS ADMINISTRATIVOS
        // ==========================================
        if (group === 'admin') {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({
                    content: '❌ **Acceso Restringido:** Solo oficiales autorizados pueden ejecutar ajustes de tesorería.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const amount = interaction.options.getInteger('monto');
            const target = interaction.options.getString('destino') || interaction.options.getString('origen') || 'wallet';

            if (sub === 'dar') {
                const acc = economyDb.adminAdjustBalance(targetUser.id, 'add', amount, target);
                return interaction.reply({
                    content: `✅ **Ajuste Concedido:** Se han abonado **${sym}${amount.toLocaleString()}** al saldo (${target}) de <@${targetUser.id}>. Saldo total: **${sym}${(acc.wallet + acc.bank).toLocaleString()}**.`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (sub === 'quitar') {
                const acc = economyDb.adminAdjustBalance(targetUser.id, 'remove', amount, target);
                return interaction.reply({
                    content: `⚠️ **Fondos Decomisados:** Se han descontado **${sym}${amount.toLocaleString()}** del saldo (${target}) de <@${targetUser.id}>. Saldo total: **${sym}${(acc.wallet + acc.bank).toLocaleString()}**.`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (sub === 'fijar') {
                const acc = economyDb.adminAdjustBalance(targetUser.id, 'set', amount, target);
                return interaction.reply({
                    content: `🔧 **Saldo Reconfigurado:** El saldo (${target}) de <@${targetUser.id}> ha sido fijado en **${sym}${amount.toLocaleString()}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Verificación de activación y permisos por rol para comandos estándar
        const permCheck = economyDb.isCommandAllowed(sub, interaction.member);
        if (!permCheck.allowed) {
            return interaction.reply({
                content: permCheck.reason === 'DISABLED'
                    ? `🔒 **Protocolo Inactivo:** La orden militar \`/${sub}\` se encuentra temporalmente deshabilitada por el Estado Mayor.`
                    : `🔒 **Acceso Denegado:** Tu rango militar actual no cuenta con la autorización requerida para ejecutar \`/${sub}\`.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // ==========================================
        // /economia balance
        // ==========================================
        if (sub === 'balance') {
            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const acc = economyDb.getAccount(targetUser.id, guildId);
            const netWorth = acc.wallet + acc.bank;

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`🎖️ [REGISTRO FINANCIERO // ${targetUser.tag.toUpperCase()}]`)
                .setThumbnail(targetUser.displayAvatarURL())
                .setDescription(`
**Estado de Cuenta Oficial**
Divisa Operativa: **${curName}** (\`${sym}\`)

> 💵 **Cartera (Efectivo):** \`${sym}${acc.wallet.toLocaleString()}\`
> 🏦 **Caja Fuerte (Banco):** \`${sym}${acc.bank.toLocaleString()}\` / \`${sym}${acc.bank_capacity.toLocaleString()}\`
> 💎 **Patrimonio Neto Total:** \`${sym}${netWorth.toLocaleString()}\`
                `)
                .setFooter({ text: 'Sistema de Tesorería USMC • Cuartel General', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // ==========================================
        // /economia depositar
        // ==========================================
        if (sub === 'depositar') {
            const val = interaction.options.getString('monto').trim().toLowerCase();
            const res = economyDb.deposit(interaction.user.id, val);

            if (!res.success) {
                return interaction.reply({ content: `❌ ${res.message}`, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('🏦 [DEPÓSITO BANCARIO CONFIRMADO]')
                .setDescription(`
Has resguardado **${sym}${res.deposited.toLocaleString()}** en la caja fuerte militar.
Tus fondos están protegidos contra robos e incidentes.

> 💵 **Efectivo Restante:** \`${sym}${res.account.wallet.toLocaleString()}\`
> 🏦 **Nuevo Saldo Bancario:** \`${sym}${res.account.bank.toLocaleString()}\`
                `)
                .setFooter({ text: 'Banco Central Militar USMC' });

            return interaction.reply({ embeds: [embed] });
        }

        // ==========================================
        // /economia retirar
        // ==========================================
        if (sub === 'retirar') {
            const val = interaction.options.getString('monto').trim().toLowerCase();
            const res = economyDb.withdraw(interaction.user.id, val);

            if (!res.success) {
                return interaction.reply({ content: `❌ ${res.message}`, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('💵 [RETIRO BANCARIO COMPLETADO]')
                .setDescription(`
Has retirado **${sym}${res.withdrawn.toLocaleString()}** de la caja fuerte a tu cartera.

> 💵 **Efectivo en Mano:** \`${sym}${res.account.wallet.toLocaleString()}\`
> 🏦 **Saldo Bancario:** \`${sym}${res.account.bank.toLocaleString()}\`
                `)
                .setFooter({ text: 'Banco Central Militar USMC' });

            return interaction.reply({ embeds: [embed] });
        }

        // ==========================================
        // /economia pagar
        // ==========================================
        if (sub === 'pagar') {
            const recipient = interaction.options.getUser('usuario');
            const amount = interaction.options.getInteger('monto');

            if (recipient.id === interaction.user.id) {
                return interaction.reply({ content: '❌ No puedes transferirte fondos a ti mismo.', flags: MessageFlags.Ephemeral });
            }
            if (recipient.bot) {
                return interaction.reply({ content: '❌ No puedes enviar dinero a terminales automatizadas o bots.', flags: MessageFlags.Ephemeral });
            }

            const res = economyDb.transfer(interaction.user.id, recipient.id, amount);
            if (!res.success) {
                return interaction.reply({ content: `❌ ${res.message}`, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('💸 [TRANSFERENCIA FINANCIERA COMPLETADA]')
                .setDescription(`
Has transferido **${sym}${amount.toLocaleString()}** en efectivo a <@${recipient.id}>.
Transacción militar asentada en los registros del cuartel.
                `)
                .setFooter({ text: 'Tesorería Táctica USMC' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // ==========================================
        // /economia trabajar
        // ==========================================
        if (sub === 'trabajar') {
            const acc = economyDb.getAccount(interaction.user.id, guildId);
            const now = Math.floor(Date.now() / 1000);
            const cooldown = settings.work_cooldown || 3600;

            if (acc.last_work && (now - acc.last_work) < cooldown) {
                const remaining = cooldown - (now - acc.last_work);
                const minutes = Math.ceil(remaining / 60);
                return interaction.reply({
                    content: `⏳ **Turno Agotado:** Has completado tu servicio recientemente. Debes descansar **${minutes} minuto(s)** antes de tu próxima guardia.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // Calcular salario base
            const min = settings.work_min || 50;
            const max = settings.work_max || 250;
            const baseEarn = Math.floor(Math.random() * (max - min + 1)) + min;

            // Bonificador de rango
            const userRoleIds = interaction.member.roles.cache.map(r => r.id);
            const bestRole = economyDb.getBestRoleRewardForUser(guildId, userRoleIds);
            const totalEarn = Math.floor((baseEarn * bestRole.multiplier) + bestRole.flat_bonus);

            economyDb.addWallet(interaction.user.id, totalEarn, 'WORK', `Salario de guardia militar (Bono: ${bestRole.role_name || 'Base'})`);
            economyDb.updateCooldown(interaction.user.id, 'work', now);

            const workDescriptions = [
                'Completaste una ronda de guardia perimetral en la torre norte.',
                'Realizaste el mantenimiento táctico del parque de vehículos blindados.',
                'Ayudaste en la logística del depósito de municiones y suministros.',
                'Apoyaste en el monitoreo de radares y telecomunicaciones en el puesto de mando.',
                'Inspeccionaste el puesto de control fronterizo y verificaste credenciales.'
            ];
            const desc = workDescriptions[Math.floor(Math.random() * workDescriptions.length)];

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('🎖️ [TURNO DE SERVICIO CUMPLIDO]')
                .setDescription(`
${desc}

> 💰 **Paga Base:** \`${sym}${baseEarn}\`
> 🎖️ **Bono por Rango:** \`${bestRole.role_name}\` (x${bestRole.multiplier} + ${sym}${bestRole.flat_bonus})
> 💵 **Pago Total Acreditado:** \`${sym}${totalEarn.toLocaleString()}\`
                `)
                .setFooter({ text: 'Paga de Servicio • USMC Base Defense' });

            return interaction.reply({ embeds: [embed] });
        }

        // ==========================================
        // /economia crimen
        // ==========================================
        if (sub === 'crimen') {
            const acc = economyDb.getAccount(interaction.user.id, guildId);
            const now = Math.floor(Date.now() / 1000);
            const cooldown = settings.crime_cooldown || 7200;

            if (acc.last_crime && (now - acc.last_crime) < cooldown) {
                const remaining = cooldown - (now - acc.last_crime);
                const minutes = Math.ceil(remaining / 60);
                return interaction.reply({
                    content: `🚨 **Bajo Vigilancia:** La policía militar tiene fichada tu ubicación. Espera **${minutes} minuto(s)** antes de planear otra incursión clandestina.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            economyDb.updateCooldown(interaction.user.id, 'crime', now);

            const failRate = settings.crime_fail_rate || 45;
            const roll = Math.random() * 100;
            const failed = roll < failRate;

            if (failed) {
                const penalty = Math.floor(settings.crime_min * 0.7);
                economyDb.removeWallet(interaction.user.id, penalty, 'CRIME', 'Multa por operación ilegal interceptada');

                const embed = new EmbedBuilder()
                    .setColor(0xff3333)
                    .setTitle('🚨 [INCURSIÓN FALLIDA // INTERCEPTADO]')
                    .setDescription(`
¡La Policía Militar te descubrió con las manos en la masa!
Has sido sancionado con una multa disciplinaria de **${sym}${penalty.toLocaleString()}** debitada de tu efectivo.
                    `)
                    .setFooter({ text: 'Código de Justicia Militar USMC' });

                return interaction.reply({ embeds: [embed] });
            } else {
                const min = settings.crime_min || 100;
                const max = settings.crime_max || 600;
                const earned = Math.floor(Math.random() * (max - min + 1)) + min;

                economyDb.addWallet(interaction.user.id, earned, 'CRIME', 'Botín de operación clandestina');

                const embed = new EmbedBuilder()
                    .setColor(0xffb000)
                    .setTitle('🕶️ [OPERACIÓN ENCUBIERTA EXITOSA]')
                    .setDescription(`
Lograste extraer suministros del mercado negro sin ser detectado por los centinelas.

> 💰 **Botín Obtenido:** \`${sym}${earned.toLocaleString()}\` guardados en tu cartera.
                    `)
                    .setFooter({ text: 'Operaciones No Autorizadas' });

                return interaction.reply({ embeds: [embed] });
            }
        }

        // ==========================================
        // /economia robar
        // ==========================================
        if (sub === 'robar') {
            const targetUser = interaction.options.getUser('usuario');
            if (targetUser.id === interaction.user.id) {
                return interaction.reply({ content: '❌ No puedes asaltarte a ti mismo.', flags: MessageFlags.Ephemeral });
            }
            if (targetUser.bot) {
                return interaction.reply({ content: '❌ No puedes asaltar a una máquina militar.', flags: MessageFlags.Ephemeral });
            }

            const senderAcc = economyDb.getAccount(interaction.user.id, guildId);
            const targetAcc = economyDb.getAccount(targetUser.id, guildId);

            if (senderAcc.wallet < 100) {
                return interaction.reply({
                    content: `❌ Necesitas tener al menos **${sym}100** en efectivo para cubrir una posible fianza en caso de que te atrapen.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (targetAcc.wallet < 50) {
                return interaction.reply({
                    content: `❌ <@${targetUser.id}> no tiene suficiente dinero en su cartera (**${sym}${targetAcc.wallet}**). No vale la pena el riesgo.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const now = Math.floor(Date.now() / 1000);
            const cooldown = settings.rob_cooldown || 14400;

            if (senderAcc.last_rob && (now - senderAcc.last_rob) < cooldown) {
                const remaining = cooldown - (now - senderAcc.last_rob);
                const minutes = Math.ceil(remaining / 60);
                return interaction.reply({
                    content: `⏳ Debes esperar **${minutes} minuto(s)** antes de intentar otro robo.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            economyDb.updateCooldown(interaction.user.id, 'rob', now);

            const failRate = settings.rob_fail_rate || 50;
            const roll = Math.random() * 100;
            const failed = roll < failRate;

            if (failed) {
                const fine = Math.min(senderAcc.wallet, Math.floor(targetAcc.wallet * 0.4) + 50);
                economyDb.removeWallet(interaction.user.id, fine, 'ROB', `Multa por intento de robo a ${targetUser.tag}`);
                economyDb.addWallet(targetUser.id, fine, 'ROB', `Compensación por intento de asalto de ${interaction.user.tag}`);

                const embed = new EmbedBuilder()
                    .setColor(0xff3333)
                    .setTitle('👮 [ASALTO FRUSTRADO]')
                    .setDescription(`
¡Intentaste sustraer la cartera de <@${targetUser.id}> pero te sorprendieron!
Tuviste que pagarle **${sym}${fine.toLocaleString()}** como indemnización inmediata.
                    `);
                return interaction.reply({ embeds: [embed] });
            } else {
                const stolen = Math.floor(targetAcc.wallet * (Math.random() * 0.3 + 0.2));
                economyDb.removeWallet(targetUser.id, stolen, 'ROB', `Asaltado por ${interaction.user.tag}`);
                economyDb.addWallet(interaction.user.id, stolen, 'ROB', `Robo exitoso a ${targetUser.tag}`);

                const embed = new EmbedBuilder()
                    .setColor(0x38e54d)
                    .setTitle('🥷 [ASALTO EJECUTADO CON ÉXITO]')
                    .setDescription(`
Lograste sustraer **${sym}${stolen.toLocaleString()}** de la cartera de <@${targetUser.id}> sin que pudiera reaccionar.
                    `);
                return interaction.reply({ embeds: [embed] });
            }
        }

        // ==========================================
        // /economia ranking
        // ==========================================
        if (sub === 'ranking') {
            const top = economyDb.getLeaderboard(10);
            if (top.length === 0) {
                return interaction.reply({ content: 'Aún no hay registros financieros en el batallón.', flags: MessageFlags.Ephemeral });
            }

            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            const lines = top.map((t, idx) => {
                const medal = medals[idx] || `${idx + 1}.`;
                const member = interaction.guild ? interaction.guild.members.cache.get(t.discord_id) : null;
                const displayName = t.username || (member ? (member.nickname || member.user.username) : '') || `Recluta`;
                return `${medal} **${displayName}** (<@${t.discord_id}>)\n   > 💎 Patrimonio: **${sym}${t.net_worth.toLocaleString()}** *(💵 ${sym}${t.wallet.toLocaleString()} │ 🏦 ${sym}${t.bank.toLocaleString()})*`;
            });

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`🏆 [ESCALAFÓN DE RIQUEZA MILITAR // TOP 10]`)
                .setDescription(`Los 10 reclutas y oficiales con mayor patrimonio neto del cuartel:\n\n${lines.join('\n\n')}`)
                .setFooter({ text: 'Tesorería Central USMC' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
};
