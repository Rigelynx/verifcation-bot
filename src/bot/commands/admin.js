const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const economyDb = require('../../database/economyDb');
const { applyVerifiedRole } = require('../handlers/verificationHandler');
const { hasOfficerPermission, hasAdminPermission } = require('../handlers/permissionHandler');
const { parseRoleIds, formatRoleMentions } = require('../utils/roleUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Comandos de administración del sistema militar de verificación')
        .setDefaultMemberPermissions(null)
        .addSubcommand(sub =>
            sub.setName('verificar-manual')
                .setDescription('Verifica manualmente a un recluta sin requerir formulario web')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a verificar').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo de la acreditación manual').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('desverificar')
                .setDescription('Revoca la verificación militar a un usuario')
                .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a desverificar').setRequired(true))
                .addStringOption(opt => opt.setName('motivo').setDescription('Motivo de la revocación').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('panel-web')
                .setDescription('Muestra el enlace y credenciales para el Centro de Mando Web')
        )
        .addSubcommand(sub =>
            sub.setName('configurar')
                .setDescription('Ajusta parámetros, roles asignados al verificarse y permisos de oficiales')
                .addRoleOption(opt => opt.setName('rol_verificado').setDescription('Rol otorgado al verificarse').setRequired(false))
                .addRoleOption(opt => opt.setName('rol_no_verificado').setDescription('Rol temporal previo a verificación').setRequired(false))
                .addRoleOption(opt => opt.setName('rol_oficial').setDescription('Rol de oficiales para comandos y moderación').setRequired(false))
                .addRoleOption(opt => opt.setName('rol_admin').setDescription('Rol de administradores militares').setRequired(false))
                .addChannelOption(opt => opt.setName('canal_revision').setDescription('Canal de oficiales para revisar solicitudes').setRequired(false))
                .addChannelOption(opt => opt.setName('canal_logs').setDescription('Canal de auditoría / logs').setRequired(false))
                .addChannelOption(opt => opt.setName('canal_logs_economia').setDescription('Canal de Discord para auditoría y transacciones financieras').setRequired(false))
                .addStringOption(opt => 
                    opt.setName('modo')
                        .setDescription('Modo de verificación')
                        .addChoices(
                            { name: 'Manual (Oficiales aprueban vía Discord o Web)', value: 'manual' },
                            { name: 'Automático (Rol inmediato al enviar formulario)', value: 'auto' }
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        // Comprobación de permisos
        if (['verificar-manual', 'desverificar'].includes(subcommand)) {
            if (!hasOfficerPermission(interaction)) {
                return interaction.reply({
                    content: '❌ **Acceso denegado:** Solo oficiales autorizados en el panel web o administradores pueden usar este comando.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } else {
            if (!hasAdminPermission(interaction)) {
                return interaction.reply({
                    content: '❌ **Acceso denegado:** Se requieren credenciales de Administrador Militar para ejecutar este protocolo.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        if (subcommand === 'verificar-manual') {
            const targetUser = interaction.options.getUser('usuario');
            const reason = interaction.options.getString('motivo') || 'Aprobado manualmente por oficial';
            const config = db.getConfig(guildId);

            // Guardar en base de datos local
            db.submitVerification(
                targetUser.id,
                targetUser.tag,
                targetUser.displayAvatarURL(),
                { 'Acreditación': 'Verificación manual directa por Estado Mayor' },
                'APROBADO'
            );
            db.updateVerificationStatus(targetUser.id, 'APROBADO', interaction.user.id, reason, interaction.user.tag);

            // Aplicar roles
            await applyVerifiedRole(interaction.guild, targetUser.id, config);
            economyDb.syncAccountUser(
                targetUser.id,
                targetUser.tag,
                targetUser.displayAvatarURL({ extension: 'png', size: 128 }),
                guildId
            );

            // DM al usuario
            targetUser.send(`🎖️ **[COMUNICADO USMC]** Has sido verificado manualmente por el oficial <@${interaction.user.id}>.`).catch(() => {});

            return interaction.reply({
                content: `✅ **El usuario <@${targetUser.id}> ha sido verificado manualmente con éxito.**`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (subcommand === 'desverificar') {
            const targetUser = interaction.options.getUser('usuario');
            const reason = interaction.options.getString('motivo') || 'Revocación disciplinaria o administrativa';
            const config = db.getConfig(guildId);

            // Actualizar en base de datos
            db.updateVerificationStatus(targetUser.id, 'RECHAZADO', interaction.user.id, reason, interaction.user.tag);

            // Quitar rol de verificado
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (member) {
                for (const roleId of parseRoleIds(config.verified_role_id)) {
                    await member.roles.remove(roleId).catch(console.error);
                }
            }
            if (member) {
                for (const roleId of parseRoleIds(config.unverified_role_id)) {
                    await member.roles.add(roleId).catch(console.error);
                }
            }

            targetUser.send(`⚠️ **[COMUNICADO USMC]** Tu acreditación militar ha sido revocada por <@${interaction.user.id}>. Motivo: *${reason}*.`).catch(() => {});

            return interaction.reply({
                content: `⚠️ **Verificación revocada para <@${targetUser.id}>.** Se ha retirado el rol correspondiente y actualizado el expediente.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (subcommand === 'panel-web') {
            const webUrl = process.env.WEB_URL || `http://localhost:${process.env.PORT || 3000}`;
            const adminKey = process.env.ADMIN_KEY || 'USMC-COMMAND-2026';

            const embed = new EmbedBuilder()
                .setColor(0xe5b338)
                .setTitle('🛡️ [ACCESO AL CENTRO DE MANDO WEB]')
                .setDescription('Utiliza el siguiente enlace para ingresar a la terminal administrativa táctica:')
                .addFields(
                    { name: '🌐 Enlace de Acceso', value: `[Abrir Dashboard Táctico](${webUrl}/admin)`, inline: false },
                    { name: '🔑 Clave Maestra de Oficial (ADMIN_KEY)', value: `\`${adminKey}\``, inline: false },
                    { name: '💾 Almacenamiento Local', value: 'Base de Datos SQLite activa en tu hosting (50GB)', inline: true }
                )
                .setFooter({ text: 'No compartas la clave con reclutas o personal no autorizado.', iconURL: interaction.guild.iconURL() });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'configurar') {
            const verifiedRole = interaction.options.getRole('rol_verificado');
            const unverifiedRole = interaction.options.getRole('rol_no_verificado');
            const officerRole = interaction.options.getRole('rol_oficial');
            const adminRole = interaction.options.getRole('rol_admin');
            const reviewChannel = interaction.options.getChannel('canal_revision');
            const logChannel = interaction.options.getChannel('canal_logs');
            const ecoLogChannel = interaction.options.getChannel('canal_logs_economia');
            const modo = interaction.options.getString('modo');

            const updates = {};
            if (verifiedRole) updates.verified_role_id = verifiedRole.id;
            if (unverifiedRole) updates.unverified_role_id = unverifiedRole.id;
            if (officerRole) updates.officer_role_id = officerRole.id;
            if (adminRole) updates.admin_role_id = adminRole.id;
            if (reviewChannel) updates.review_channel_id = reviewChannel.id;
            if (logChannel) updates.log_channel_id = logChannel.id;
            if (modo) updates.verification_mode = modo;

            db.updateConfig(guildId, updates);
            if (ecoLogChannel) {
                economyDb.updateEconomySettings(guildId, { log_channel_id: ecoLogChannel.id });
            }
            const currentCfg = db.getConfig(guildId);
            const currentEco = economyDb.getEconomySettings(guildId);

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle('⚙️ [PARÁMETROS MILITARES ACTUALIZADOS]')
                .setDescription('La configuración del sistema se ha guardado en la base de datos local.')
                .addFields(
                    { name: '🔹 Modo de Verificación', value: `\`${currentCfg.verification_mode.toUpperCase()}\``, inline: true },
                    { name: '🔹 Roles Asignados al Verificar', value: formatRoleMentions(currentCfg.verified_role_id), inline: true },
                    { name: '🔹 Rol No Verificado (a retirar)', value: formatRoleMentions(currentCfg.unverified_role_id), inline: true },
                    { name: '🎖️ Rol de Oficiales (Comandos/Revisión)', value: formatRoleMentions(currentCfg.officer_role_id, '*Moderadores nativos*'), inline: true },
                    { name: '🛡️ Rol de Administradores', value: formatRoleMentions(currentCfg.admin_role_id, '*Administradores nativos*'), inline: true },
                    { name: '🔹 Canal de Oficiales (Revisión)', value: currentCfg.review_channel_id ? `<#${currentCfg.review_channel_id}>` : '*Sin asignar*', inline: true },
                    { name: '🔹 Canal Logs Verificación / Mod', value: currentCfg.log_channel_id ? `<#${currentCfg.log_channel_id}>` : '*Sin asignar*', inline: true },
                    { name: '💰 Canal Logs de Economía', value: currentEco.log_channel_id ? `<#${currentEco.log_channel_id}>` : '*Sin asignar (Solo web)*', inline: true }
                )
                .setFooter({ text: 'También puedes modificar y seleccionar canales directamente desde el Dashboard Web.' });

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};
