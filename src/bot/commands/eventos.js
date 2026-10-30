const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
    ChannelType, 
    MessageFlags 
} = require('discord.js');
const db = require('../../database/db');
const economyDb = require('../../database/economyDb');
const { hasOfficerPermission } = require('../handlers/permissionHandler');
const { refreshPublicServerBoard } = require('./servidor');

const EVENT_REPORT_TEAMS = [
    { key: 'alpha', label: 'Equipo Alpha', emoji: '🟥' },
    { key: 'bravo', label: 'Equipo Bravo', emoji: '🟩' },
    { key: 'charlie', label: 'Equipo Charlie', emoji: '🟦' },
    { key: 'delta', label: 'Equipo Delta', emoji: '🟨' },
    { key: 'echo', label: 'Equipo Echo', emoji: '🟧' },
    { key: 'seal_red', label: 'SEAL Comms Red Team', emoji: '🔱' },
    { key: 'seal_gold', label: 'SEAL Comms Gold Team', emoji: '🔱' },
    { key: 'delta_force', label: 'Delta Force VC', emoji: '🐺' },
    { key: 'soar', label: '160-SOAR VC', emoji: '⚔️' },
    { key: 'ranger', label: 'Ranger Command', emoji: '🔰' }
];

/**
 * Genera el mensaje táctico del Panel de Registro / Convocatoria Militar
 */
function buildRegistrationPanel(event, settings = null) {
    const sym = settings ? settings.currency_symbol : '$';
    const maxRecruitsText = event.max_participants > 0 ? `\`${event.max_participants} soldados\`` : '`Sin Límite (Ilimitado)`';
    const isTraining = event.event_type === 'TRAINING';
    const rewardText = isTraining
        ? `> 🎓 **Rol para aprobados:** <@&${event.reward_role_id}>`
        : `> 💰 **Paga de Misión:** \`${sym}${event.base_reward.toLocaleString()}\` *(+ Bonificación por Rango Militar)*\n> ⚡ **Liquidación:** \`Automática al finalizar\``;
    const introText = isTraining
        ? 'Todos los aspirantes deben registrarse. Al terminar, el oficial retirará de la lista a los reprobados y el rol se entregará a quienes permanezcan.'
        : 'Todos los combatientes interesados en participar y hacerse acreedores a la asignación presupuestaria deben formalizar su inscripción pulsando el botón táctico inferior.';
    const instructions = isTraining
        ? '1. Pulsa **`[ 📝 REGISTRARSE EN LA OPERACIÓN ]`** para entrar en la lista.\n2. Al concluir, el oficial retirará del roster a quienes no aprobaron.\n3. Al finalizar el entrenamiento, recibirás automáticamente el rol configurado.'
        : '1. Pulsa **`[ 📝 REGISTRARSE EN LA OPERACIÓN ]`** para entrar en la lista.\n2. Al concluir, el oficial retirará del roster a quienes no asistieron.\n3. Los soldados que permanezcan recibirán su paga automáticamente al finalizar.';

    const embed = new EmbedBuilder()
        .setColor(0x00b4d8) // Tactical Blue
        .setTitle(`📋 [CONVOCATORIA MILITAR DE OPERACIÓN // ${event.name.toUpperCase()}]`)
        .setDescription(`
**El Mando Supremo de la Base Comunidad ha abierto la lista de alistamiento.**

${introText}

> 🎖️ **Misión:** \`${event.name}\`
${rewardText}
> 👥 **Cupo de Escuadrón:** ${maxRecruitsText}
> 🛡️ **Fase Actual:** \`CONVOCATORIA Y ALISTAMIENTO ACTIVO\`
        `)
        .addFields(
            { 
                name: '📌 Instrucciones Tácticas', 
                value: instructions,
                inline: false 
            }
        )
        .setFooter({ text: `Operación ID: #${event.id} • Comunidad Tactical Roster System` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`event_register_${event.id}`)
            .setLabel('REGISTRARSE EN LA OPERACIÓN')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📝'),
        new ButtonBuilder()
            .setCustomId(`event_unregister_${event.id}`)
            .setLabel('ANULAR REGISTRO')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Genera el mensaje táctico del Panel de Confirmación de Asistencia (Pase de Lista)
 */
function buildConfirmationPanel(event, settings = null) {
    const embed = new EmbedBuilder()
        .setColor(0xffb000) // Tactical Amber / Warning
        .setTitle(`📍 [PASE DE LISTA // CONFIRMAR ASISTENCIA // ${event.name.toUpperCase()}]`)
        .setDescription(`
**¡Atención personal comunitario convocado!**
La operación ha concluido o se encuentra en fase de verificación de presencia en el terreno.

Pulsa de inmediato el botón inferior para formalizar tu **asistencia táctica**. Solo los combatientes que confirmen su presencia serán acreditados para recibir sus haberes comunitarios.

> 🎖️ **Operación:** \`${event.name}\`
> 🛡️ **Estado:** \`VERIFICACIÓN DE ASISTENCIA EN VIVO\`
> ⚡ **Aviso:** No demores tu confirmación. Los registros cerrarán al liquidar la nómina.
        `)
        .setFooter({ text: `Operación ID: #${event.id} • Pase de Lista Comunidad` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`event_confirm_${event.id}`)
            .setLabel('CONFIRMAR MI ASISTENCIA')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅')
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Genera el mensaje táctico del Panel de Cobro / Reclamo de Paga Militar
 */
function buildPayoutPanel(event, settings = null, claimExpiresAt = null) {
    const sym = settings ? settings.currency_symbol : '$';
    const expiresUnix = claimExpiresAt || event.claim_expires_at || (Math.floor(Date.now() / 1000) + ((event.claim_deadline_hours || 24) * 3600));
    const expiresTimestamp = `<t:${expiresUnix}:R>`;

    const embed = new EmbedBuilder()
        .setColor(0x38e54d) // Emerald Green
        .setTitle(`🎖️ [NÓMINA MILITAR LIBERADA // ${event.name.toUpperCase()}]`)
        .setDescription(`
**La misión comunitario ha concluido y el Mando ha autorizado la dispersión de fondos.**

Todos los combatientes cuya asistencia fue confirmada pueden transferir su paga directamente a su cartera comunitario pulsando el botón inferior.

> 💰 **Paga Base Asignada:** \`${sym}${event.base_reward.toLocaleString()}\` *(+ Escalafón de Rango)*
> ⏳ **Plazo Límite de Cobro:** Expira en ${expiresTimestamp}
> 🛡️ **Destino:** Cartera Militar Táctica (Efectivo)
        `)
        .addFields(
            {
                name: '📋 Requisitos de Cobro',
                value: 'El sistema validará automáticamente que hayas confirmado tu asistencia o cumplido la permanencia mínima requerida.',
                inline: false
            }
        )
        .setFooter({ text: `Operación ID: #${event.id} • Tesorería de Operaciones Comunidad` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`claim_event_${event.id}`)
            .setLabel('RECLAMAR PAGA MILITAR')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💵')
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Genera el panel táctico de lista de miembros convocados con paginación y botones de baja
 */
function buildEventRosterPanel(event, page = 1, settings = null) {
    const sym = settings ? settings.currency_symbol : '$';
    const roster = economyDb.getEventRegistrations(event.id); // Solo activos (excluye expulsados y cancelados)
    const registeredCount = roster.length;
    const confirmedCount = roster.filter(r => r.attendance_confirmed === 1 || r.is_eligible === 1).length;
    const claimedCount = roster.filter(r => r.claimed === 1).length;
    const isTraining = event.event_type === 'TRAINING';
    const rosterInstructions = isTraining
        ? '*El encargado puede pasar lista en la web. Ausentes y quienes no responden quedan sin acreditar; puedes retirar a quienes reprobaron.*'
        : '*El encargado puede pasar lista en la web: Presente / Ausente / No responde. Ausentes y quienes no responden quedan fuera del pago.*';
    const approvedCount = roster.filter(r => !economyDb.isEventAttendeeRejected(r)).length;
    const attendanceSummary = isTraining
        ? `> 🎓 **Aprobados actuales:** \`${approvedCount}\``
        : event.event_type === 'REGISTRATION'
            ? `> ✅ **Asistentes aprobados:** \`${approvedCount}\``
            : `> ✅ **Asistencia Elegible:** \`${confirmedCount}\``;
    const rewardSummary = isTraining
        ? `> 🎓 **Rol al finalizar:** <@&${event.reward_role_id}>`
        : `> 💵 **Haberes Cobrados:** \`${claimedCount}\`\n> 💰 **Paga Base:** \`${sym}${event.base_reward.toLocaleString()}\``;

    const PAGE_SIZE = 5;
    const totalPages = Math.max(1, Math.ceil(roster.length / PAGE_SIZE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageItems = roster.slice(startIndex, startIndex + PAGE_SIZE);

    let listText = 'Ningún combatiente registrado aún en esta operación comunitario.';
    if (pageItems.length > 0) {
        listText = pageItems.map((r, i) => {
            const slot = startIndex + i + 1;
            let statusBadge = '📝 `Inscrito`';
            if (r.claimed === 1) statusBadge = `💵 \`Cobrado (${sym}${r.payout_amount})\``;
            else if (r.attendance_confirmed === 1 || r.is_eligible === 1) statusBadge = '✅ `Asistencia Confirmada`';
            if (r.roll_call_status) statusBadge = { PRESENT: '✅ `Presente`', ABSENT: '❌ `Ausente`', NO_RESPONSE: '🟠 `No responde`' }[r.roll_call_status] || statusBadge;

            return `\`[#${slot}]\` <@${r.discord_id}> (\`${r.username}\`) — ${statusBadge}`;
        }).join('\n\n');
    }

    const embed = new EmbedBuilder()
        .setColor(0x00b4d8)
        .setTitle(`📋 [ROSTER TÁCTICO // OPERACIÓN #${event.id} // ${event.name.toUpperCase()}]`)
        .setDescription(`
**Panel de control de alistamiento comunitario en tiempo real.**
${rosterInstructions}

> 🎖️ **Operación:** \`${event.name}\` (\`${event.event_type}\`)
> 🛡️ **Fase Actual:** \`${event.phase || event.status}\`
> 👥 **Total Inscritos:** \`${registeredCount}\` ${event.max_participants > 0 ? `/ ${event.max_participants}` : ''}
${attendanceSummary}
${rewardSummary}

**Soldados en esta Página (${currentPage}/${totalPages}):**
${listText}
        `)
        .setFooter({ text: `Página ${currentPage} de ${totalPages} • Total: ${registeredCount} soldados • Pase de Lista Comunidad` })
        .setTimestamp();

    const components = [];

    // Fila 1: Botones individuales para dar de baja / borrar a los miembros de esta página
    if (pageItems.length > 0) {
        const expelRow = new ActionRowBuilder();
        for (let i = 0; i < pageItems.length; i++) {
            const r = pageItems[i];
            const slot = startIndex + i + 1;
            expelRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`event_expel_${event.id}_${r.discord_id}_${currentPage}`)
                    .setLabel(`🗑️ #${slot}`)
                    .setStyle(ButtonStyle.Danger)
            );
        }
        components.push(expelRow);
    }

    // Fila 2: Botones de navegación por página y actualización
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`event_roster_page_${event.id}_${currentPage - 1}`)
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`event_roster_indicator_${event.id}`)
            .setLabel(`Página ${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`event_roster_page_${event.id}_${currentPage + 1}`)
            .setLabel('Siguiente ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`event_roster_refresh_${event.id}_${currentPage}`)
            .setLabel('🔄 Actualizar')
            .setStyle(ButtonStyle.Secondary)
    );
    components.push(navRow);

    const webBase = (process.env.WEB_URL || '').replace(/\/$/, '');
    if (/^https?:\/\//.test(webBase)) components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Pasar lista en la web').setEmoji('📋').setURL(`${webBase}/patrullas?evento=${event.id}`)
    ));

    return { embeds: [embed], components };
}

function buildEventPicker(events) {
    const embed = new EmbedBuilder()
        .setColor(0x00b4d8)
        .setTitle('📋 [SELECCIONAR EVENTO]')
        .setDescription('Elige una operación activa o reciente para abrir su roster. Los eventos finalizados siguen disponibles para revisión y corrección.')
        .setFooter({ text: `${events.length} evento(s) disponible(s)` });

    const select = new StringSelectMenuBuilder()
        .setCustomId('event_roster_select')
        .setPlaceholder('Selecciona un evento')
        .addOptions(events.map(event => ({
            label: `#${event.id} - ${event.name}`.slice(0, 100),
            description: `${event.status === 'ACTIVE' ? 'Activo' : 'Finalizado'} | ${event.event_type}`.slice(0, 100),
            value: String(event.id)
        })));

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function createEventFinalizationDraft(event, interaction, evidence, resultText, notes, isEditingReport = false) {
    const existingDraft = economyDb.getEventFinalizationDraft(event.id) || {};
    let savedReportData = {};
    try {
        if (event.report_data) savedReportData = JSON.parse(event.report_data);
    } catch {}

    let defaultServerName = existingDraft.server_used || savedReportData.server_used || '';
    if (!defaultServerName && event.private_server_id) {
        const srv = db.getPrivateServerById(event.private_server_id);
        if (srv) defaultServerName = `${srv.server_name}${srv.server_code ? ` (${srv.server_code})` : ''}`;
    }

    const creatorId = /^\d{16,22}$/.test(String(existingDraft.director_id || event.created_by_id || ''))
        ? String(existingDraft.director_id || event.created_by_id)
        : interaction.user.id;

    return {
        requested_by: interaction.user.id,
        is_editing_report: Boolean(isEditingReport),
        director_id: creatorId,
        director_name: existingDraft.director_name || event.created_by_name || interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
        co_host_id: existingDraft.co_host_id || savedReportData.co_host_id || '',
        mvp_id: existingDraft.mvp_id || savedReportData.mvp_id || '',
        sector_ao: existingDraft.sector_ao || savedReportData.sector_ao || 'Sin especificar',
        server_used: defaultServerName,
        mission_rating: existingDraft.mission_rating || savedReportData.mission_rating || (event.event_type === 'TRAINING' ? '🎓 EJERCICIO COMPLETADO' : '✅ OPERACIÓN EXITOSA'),
        casualties_stats: existingDraft.casualties_stats || savedReportData.casualties_stats || '',
        active_team: existingDraft.active_team || 'alpha',
        member_page: Number(existingDraft.member_page) || 0,
        teams: existingDraft.teams || savedReportData.teams || {},
        evidence: evidence
            ? { url: evidence.url, contentType: evidence.contentType || '' }
            : (existingDraft.evidence || (savedReportData.evidence_url ? { url: savedReportData.evidence_url, contentType: 'image/png' } : null)),
        result: resultText !== null && resultText !== undefined ? resultText : (existingDraft.result || savedReportData.result || ''),
        notes: notes !== null && notes !== undefined ? notes : (existingDraft.notes || savedReportData.notes || ''),
        started_at: Date.now()
    };
}

function formatUserRef(rawVal) {
    if (!rawVal) return 'No asignado';
    const clean = String(rawVal).replace(/[<@!>]/g, '').trim();
    if (/^\d{15,22}$/.test(clean)) return `<@${clean}>`;
    return String(rawVal);
}

function buildEventFinalizationPanel(event, draft) {
    const roster = economyDb.getEventRegistrations(event.id).filter(attendee => !economyDb.isEventAttendeeRejected(attendee));
    const fullRoster = economyDb.getEventRegistrations(event.id, true);
    const removedCount = fullRoster.filter(item => ['EXPELLED', 'CANCELLED'].includes(item.status)).length;
    const activeTeam = EVENT_REPORT_TEAMS.find(team => team.key === draft.active_team) || EVENT_REPORT_TEAMS[0];
    const teamData = draft.teams?.[activeTeam.key] || { members: [], leader_id: null };
    const assignedIds = new Set(Object.values(draft.teams || {}).flatMap(team => team.members || []));
    const configuredTeams = EVENT_REPORT_TEAMS.filter(team => (draft.teams?.[team.key]?.members || []).length > 0);
    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(roster.length / pageSize));
    const page = Math.min(Math.max(Number(draft.member_page) || 0, 0), totalPages - 1);
    const pageRoster = roster.slice(page * pageSize, (page + 1) * pageSize);
    const teamSummary = configuredTeams.length
        ? configuredTeams.map(team => {
            const saved = draft.teams[team.key];
            return `${team.emoji} **${team.label}:** ${saved.members.length} integrante(s)${saved.leader_id ? ` · Líder <@${saved.leader_id}>` : ' · *Líder pendiente*'}`;
        }).join('\n')
        : '*Sin equipos específicos asignados (se listarán en el bloque general de aprobados).*';

    const isEditing = Boolean(draft.is_editing_report);

    const assignedCount = roster.filter(m => assignedIds.has(String(m.discord_id))).length;
    const teamPreview = teamData.members.map(id => `<@${id}>${String(teamData.leader_id) === String(id) ? ' ★' : ''}`).join(' · ');
    const embed = new EmbedBuilder().setColor(isEditing ? 0xdcb96c : 0x59c9a5)
        .setTitle(`${isEditing ? '✏️ EDITAR REPORTE' : '📋 PREPARAR REPORTE'} · OPERACIÓN #${event.id}`)
        .setDescription(`**${String(event.name).slice(0, 150)}**\n${roster.length} participantes · ${configuredTeams.length} equipos · **${roster.length - assignedCount} sin asignar**`)
        .addFields(
            { name: '01 ┃ MANDO Y DESPLIEGUE', value: `**Mando:** ${draft.director_id ? `<@${draft.director_id}>` : 'Sin asignar'}\n**AO:** ${String(draft.sector_ao || 'Sin especificar').slice(0, 100)}\n**Servidor:** ${String(draft.server_used || 'Sin asignar').slice(0, 120)}\n**Resultado:** ${String(draft.mission_rating || 'Pendiente').slice(0, 100)}` },
            { name: '02 ┃ ORGANIZACIÓN DE EQUIPOS', value: teamSummary.slice(0, 1024) },
            { name: `${activeTeam.emoji} EDITANDO: ${activeTeam.label} · ${teamData.members.length} integrantes`, value: (teamPreview || 'Selecciona integrantes o pega sus IDs. ★ identifica al líder.').slice(0, 1024) },
            { name: '03 ┃ ANÁLISIS TÁCTICO', value: String(draft.result || 'Completa los objetivos, bajas y observaciones en Datos del evento.').slice(0, 500) })
        .setFooter({ text: `${isEditing ? 'Actualiza el reporte original; no vuelve a pagar' : 'Borrador guardado'} • Integrantes ${page + 1}/${totalPages} • Cambia de equipo con el selector` });

    const components = [];
    const directorSelect = new UserSelectMenuBuilder()
        .setCustomId(`event_finalize_director_${event.id}`)
        .setPlaceholder('Cambiar oficial encargado del evento')
        .setMinValues(1)
        .setMaxValues(1);
    if (/^\d{16,22}$/.test(String(draft.director_id || ''))) directorSelect.setDefaultUsers(draft.director_id);
    components.push(new ActionRowBuilder().addComponents(directorSelect));

    const teamSelect = new StringSelectMenuBuilder()
        .setCustomId(`event_finalize_team_${event.id}`)
        .setPlaceholder('Seleccionar escuadra o equipo para editar')
        .addOptions([...EVENT_REPORT_TEAMS.map(team => ({
            label: team.label,
            value: team.key,
            emoji: team.emoji,
            description: `${draft.teams?.[team.key]?.members?.length || 0} integrante(s) asignado(s)`,
            default: team.key === activeTeam.key
        })), { label: 'Vaciar equipo seleccionado', value: '__clear_team', description: 'Retira integrantes y líder de este equipo', emoji: '🧹' }]);
    components.push(new ActionRowBuilder().addComponents(teamSelect));

    if (pageRoster.length) {
        const membersSelect = new StringSelectMenuBuilder()
            .setCustomId(`event_finalize_members_${event.id}`)
            .setPlaceholder(`Integrantes de ${activeTeam.label}`)
            .setMinValues(0)
            .setMaxValues(pageRoster.length)
            .addOptions(pageRoster.map(member => ({
                label: String(member.username || member.discord_id).slice(0, 100),
                description: assignedIds.has(member.discord_id) && !teamData.members.includes(member.discord_id) ? 'Asignado a otro equipo; se moverá' : `ID: ${member.discord_id}`,
                value: String(member.discord_id),
                default: teamData.members.includes(String(member.discord_id))
            })));
        components.push(new ActionRowBuilder().addComponents(membersSelect));
    }

    if (teamData.members.length) {
        const leaderSelect = new UserSelectMenuBuilder()
            .setCustomId(`event_finalize_leader_${event.id}`)
            .setPlaceholder(`Líder de ${activeTeam.label}`)
            .setMinValues(1)
            .setMaxValues(1);
        if (teamData.leader_id) leaderSelect.setDefaultUsers(String(teamData.leader_id));
        components.push(new ActionRowBuilder().addComponents(leaderSelect));
    }

    const actions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`event_finalize_tactical_${event.id}`).setLabel('Datos del evento').setEmoji('📝').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`event_finalize_ids_${event.id}`).setLabel('Por IDs').setEmoji('🆔').setStyle(ButtonStyle.Primary),
        totalPages > 1
            ? new ButtonBuilder().setCustomId(`event_finalize_next_${event.id}`).setLabel(`Pág ${page + 1}/${totalPages} ▶`).setStyle(ButtonStyle.Secondary)
            : new ButtonBuilder().setCustomId(`event_finalize_clear_${event.id}`).setLabel('Limpiar Eq.').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`event_finalize_confirm_${event.id}`)
            .setLabel(isEditing ? 'ACTUALIZAR REGISTRO' : 'PUBLICAR REGISTRO')
            .setEmoji(isEditing ? '💾' : '✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`event_finalize_cancel_${event.id}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
    );
    components.push(actions);

    return { embeds: [embed], components };
}

function resolveActiveEvent(guildId, requestedId) {
    const activeEvents = economyDb.getActiveEvents(guildId);
    if (requestedId) {
        const event = economyDb.getEventById(requestedId);
        if (!event || (event.guild_id !== guildId && event.guild_id !== 'GLOBAL')) {
            return { error: `No existe el evento #${requestedId} en este servidor.` };
        }
        if (event.status !== 'ACTIVE') {
            return { error: `El evento #${requestedId} ya está finalizado.` };
        }
        return { event };
    }
    if (activeEvents.length === 1) return { event: activeEvents[0] };
    if (activeEvents.length === 0) return { error: 'No hay ninguna operación comunitario activa en este momento.' };
    return { error: `Hay ${activeEvents.length} eventos activos. Indica \`evento_id\` (puedes consultarlo con \`/evento lista\`).` };
}

async function awardTrainingRole(interaction, event) {
    const role = interaction.guild.roles.cache.get(event.reward_role_id) || await interaction.guild.roles.fetch(event.reward_role_id).catch(() => null);
    if (!role) throw new Error('El rol configurado ya no existe en el servidor.');
    if (role.managed || !role.editable) {
        throw new Error(`No puedo administrar el rol ${role}. Revisa que mi rol esté por encima y que tenga permiso para gestionar roles.`);
    }

    const roster = economyDb.getEventRegistrations(event.id).filter(attendee => !economyDb.isEventAttendeeRejected(attendee));
    const awarded = [];
    const alreadyHadRole = [];
    const failed = [];

    for (const attendee of roster) {
        try {
            const member = await interaction.guild.members.fetch(attendee.discord_id);
            if (member.roles.cache.has(role.id)) {
                alreadyHadRole.push(attendee.discord_id);
            } else {
                await member.roles.add(role, `Aprobado en entrenamiento #${event.id}: ${event.name}`);
                awarded.push(attendee.discord_id);
            }
        } catch (error) {
            failed.push({ discordId: attendee.discord_id, reason: error.message });
        }
    }

    if (event.status === 'ACTIVE') economyDb.finalizeEvent(event.id);
    economyDb.setEventPhase(event.id, 'ENDED');
    return { role, rosterCount: roster.length, awarded, alreadyHadRole, failed };
}

function getReportTemplate(event) {
    try {
        if (event.report_template_snapshot) return JSON.parse(event.report_template_snapshot);
    } catch {}
    return {
        name: 'Registro general', title: 'REGISTRO OFICIAL DE OPERACIÓN', description: '',
        emoji: '🎖️', color: '#1a7f4b', report_channel_id: '', grouping_mode: 'STATUS',
        group_roles: [], evidence_required: false, sticker_id: '', footer: 'Registro Oficial de la Comunidad',
        template_kind: 'ALL', approved_label: 'APROBADOS / ASISTENTES', rejected_label: 'NO APROBADOS',
        show_removed: true, show_payout: false
    };
}

function renderEventTemplateVariables(text, variables) {
    return String(text || '').replace(/\{(evento|id|tipo|oficial|fecha|duracion|aprobados|no_aprobados|rol)\}/gi, (match, key) => {
        const value = variables[String(key).toLowerCase()];
        return value === undefined || value === null ? match : String(value);
    });
}

function clampReportLines(lines, emptyText = '*Sin registros*', maxLength = 900) {
    if (!lines.length) return emptyText;
    let value = '';
    for (const line of lines) {
        if ((value + line + '\n').length > maxLength) {
            value += `\n*...y ${lines.length - value.split('\n').filter(Boolean).length} más.*`;
            break;
        }
        value += `${line}\n`;
    }
    return value.trim();
}

async function publishEventReport(interaction, event, summary, evidence, resultText, notes, allowUpdate = false) {
    if (event.report_message_id && !allowUpdate) return { skipped: true, channel: null };
    const template = getReportTemplate(event);
    const roster = economyDb.getEventRegistrations(event.id, true);
    const isAlwaysRosterBased = event.event_type === 'REGISTRATION' || event.event_type === 'TRAINING';
    const approved = roster.filter(item => !economyDb.isEventAttendeeRejected(item) && (isAlwaysRosterBased || item.is_eligible === 1));
    const removed = roster.filter(item => economyDb.isEventAttendeeRejected(item) || (!isAlwaysRosterBased && item.is_eligible !== 1));
    const paidRoster = approved.filter(item => item.claimed === 1);
    const reportPaidCount = paidRoster.length || summary?.paidCount || 0;
    const reportPaidTotal = paidRoster.length
        ? paidRoster.reduce((total, item) => total + (Number(item.payout_amount) || 0), 0)
        : (summary?.totalDistributed || 0);
    const endMs = event.ended_at ? (new Date(event.ended_at).getTime() || Date.now()) : Date.now();
    const durationMinutes = Math.max(1, Math.floor((endMs - new Date(event.created_at).getTime()) / 60000));
    const color = parseInt(String(template.color || '#1a7f4b').replace('#', ''), 16) || 0x1a7f4b;
    const finalizationDraft = economyDb.getEventFinalizationDraft(event.id) || {};
    const officerDisplay = finalizationDraft.director_id
        ? `<@${finalizationDraft.director_id}>`
        : (finalizationDraft.director_name || interaction.reportOfficerLabel || `<@${interaction.user.id}>`);
    const eventName = String(event.name || 'Evento').slice(0, 200);
    const sectorAo = finalizationDraft.sector_ao || 'Sin especificar';
    const missionRating = finalizationDraft.mission_rating || (event.event_type === 'TRAINING' ? '🎓 EJERCICIO COMPLETADO' : '✅ OPERACIÓN EXITOSA');
    const serverUsed = finalizationDraft.server_used || '';
    const coHostDisplay = finalizationDraft.co_host_id ? formatUserRef(finalizationDraft.co_host_id) : '';
    const mvpDisplay = finalizationDraft.mvp_id ? formatUserRef(finalizationDraft.mvp_id) : '';
    const casualtiesStats = finalizationDraft.casualties_stats || '';
    const effectiveResult = resultText !== undefined && resultText !== null ? resultText : (finalizationDraft.result || '');
    const effectiveNotes = notes !== undefined && notes !== null ? notes : (finalizationDraft.notes || '');

    const templateVariables = {
        evento: eventName,
        id: event.id,
        tipo: event.event_type,
        oficial: officerDisplay,
        fecha: `<t:${Math.floor(Date.now() / 1000)}:D>`,
        duracion: `${durationMinutes} min`,
        aprobados: approved.length,
        no_aprobados: removed.length,
        rol: event.reward_role_id ? `<@&${event.reward_role_id}>` : 'No aplica'
    };
    const customDescription = renderEventTemplateVariables(template.description, templateVariables);

    const headerLines = [
        `> 🎖️ **Operación / Actividad:** \`${eventName}\``,
        `> 🆔 **Código de Registro:** \`#OP-${String(event.id).padStart(3, '0')}\`   •   📅 **Fecha:** ${templateVariables.fecha}`,
        `> 🗺️ **Sector / Zona AO:** \`${sectorAo}\`${serverUsed ? `   •   🛰️ **Servidor:** \`${serverUsed}\`` : ''}`,
        `> 📊 **Estado / Calificación:** \`${missionRating}\`   •   ⏱️ **Duración:** \`${templateVariables.duracion}\``,
        `> 👤 **Oficial al Mando:** ${officerDisplay}${coHostDisplay ? `   •   🛡️ **Segundo al Mando (XO):** ${coHostDisplay}` : ''}`,
        mvpDisplay ? `> 🏅 **Mención Honorífica (MVP):** ${mvpDisplay}` : null,
        event.event_type === 'TRAINING' && event.reward_role_id ? `> 🎓 **Acreditación Otorgada:** <@&${event.reward_role_id}>` : null
    ].filter(Boolean).join('\n');

    const reportDescription = `${customDescription ? `${customDescription}\n\n` : ''}### 📋 FICHA TÉCNICA DE DESPLIEGUE\n${headerLines}`;
    const footerBase = renderEventTemplateVariables(template.footer || 'Registro Oficial de la Comunidad la comunidad', templateVariables);
    const footerText = allowUpdate && event.report_message_id
        ? `${footerBase} • Editado por ${interaction.user?.username || 'Oficial'}`
        : footerBase;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${template.emoji || '🎖️'} [${renderEventTemplateVariables(template.title || 'REGISTRO OFICIAL DE OPERACIÓN', templateVariables).toUpperCase()}]`.slice(0, 256))
        .setDescription(reportDescription.slice(0, 4096))
        .setFooter({ text: footerText.slice(0, 2048) })
        .setTimestamp();

    const groupedIds = new Set();
    const configuredTeams = EVENT_REPORT_TEAMS.filter(team => (finalizationDraft.teams?.[team.key]?.members || []).length > 0);
    for (const team of configuredTeams) {
        const savedTeam = finalizationDraft.teams[team.key];
        const members = savedTeam.members
            .filter(memberId => approved.some(attendee => String(attendee.discord_id) === String(memberId)))
            .map((memberId, idx) => {
                groupedIds.add(String(memberId));
                const isLeader = String(savedTeam.leader_id || '') === String(memberId);
                return `\`[${String(idx + 1).padStart(2, '0')}]\` <@${memberId}> (\`${memberId}\`)${isLeader ? ' — ⭐ **Líder de Escuadra**' : ''}`;
            });
        if (members.length) {
            embed.addFields({
                name: `${team.emoji} ${team.label.toUpperCase()} (${members.length})`,
                value: clampReportLines(members, '*Sin integrantes*', 700),
                inline: false
            });
        }
    }
    if (!configuredTeams.length && template.grouping_mode === 'ROLES' && Array.isArray(template.group_roles)) {
        for (const group of template.group_roles.slice(0, 6)) {
            const members = [];
            for (const attendee of approved) {
                if (groupedIds.has(String(attendee.discord_id))) continue;
                const member = interaction.guild.members.cache.get(attendee.discord_id) || await interaction.guild.members.fetch(attendee.discord_id).catch(() => null);
                if (member?.roles?.cache?.has(group.role_id)) {
                    members.push(`• <@${attendee.discord_id}> (\`${attendee.discord_id}\`)`);
                    groupedIds.add(String(attendee.discord_id));
                }
            }
            if (members.length) embed.addFields({ name: `${group.emoji || '🛡️'} ${group.label || 'Unidad'} — ${members.length}`, value: clampReportLines(members, '*Sin registros*', 350), inline: false });
        }
    }
    const usesGroups = configuredTeams.length > 0 || template.grouping_mode === 'ROLES';
    const ungrouped = approved.filter(item => !groupedIds.has(String(item.discord_id)));
    if (ungrouped.length || !usesGroups) {
        const targetList = usesGroups ? ungrouped : approved;
        embed.addFields({
            name: usesGroups
                ? `✅ EFECTIVOS ADICIONALES / SIN ESCUADRA (${ungrouped.length})`
                : `✅ ${String(template.approved_label || 'APROBADOS / ASISTENTES').toUpperCase()} (${approved.length})`,
            value: clampReportLines(targetList.map((item, idx) => `\`[${String(idx + 1).padStart(2, '0')}]\` <@${item.discord_id}> (\`${item.discord_id}\`)${template.show_payout === true && item.claimed ? ` — 💵 ${item.payout_amount}` : ''}`), '*Sin registros*', 800),
            inline: false
        });
    }
    if (removed.length && template.show_removed !== false && template.show_removed !== 0) {
        embed.addFields({
            name: `❌ ${String(template.rejected_label || 'NO APROBADOS / BAJAS DE LISTA').toUpperCase()} (${removed.length})`,
            value: clampReportLines(removed.map(item => `• <@${item.discord_id}> (\`${item.discord_id}\`)`), '*Sin registros*', 450),
            inline: false
        });
    }
    if (casualtiesStats) {
        embed.addFields({
            name: '💀 BALANCE DE COMBATE Y ESTADÍSTICAS TÁCTICAS',
            value: String(casualtiesStats).slice(0, 600),
            inline: false
        });
    }
    if (event.event_type !== 'TRAINING' && template.show_payout === true) {
        embed.addFields({
            name: '💰 LIQUIDACIÓN DE HABERES',
            value: `Combatientes pagados: **${reportPaidCount}**\nTotal desembolsado: **${reportPaidTotal}**`,
            inline: true
        });
    }
    if (effectiveResult) {
        embed.addFields({
            name: '🎯 OBJETIVOS Y ANÁLISIS DE LA OPERACIÓN',
            value: String(effectiveResult).slice(0, 800),
            inline: false
        });
    }
    if (effectiveNotes) {
        embed.addFields({
            name: '📝 OBSERVACIONES DEL MANDO',
            value: String(effectiveNotes).slice(0, 800),
            inline: false
        });
    }
    if (evidence?.url && (!evidence.contentType || evidence.contentType.startsWith('image/'))) {
        embed.setImage(evidence.url);
    }

    const reportChannelId = event.report_channel_id || template.report_channel_id || interaction.channelId;
    const channel = reportChannelId ? (interaction.guild.channels.cache.get(reportChannelId) || await interaction.guild.channels.fetch(reportChannelId).catch(() => null)) : interaction.channel;
    if (!channel?.isTextBased()) throw new Error('El canal del reporte ya no está disponible.');
    if (!channel?.isTextBased()) throw new Error('El canal configurado para actas no existe o no es de texto.');

    const payload = { embeds: [embed], allowedMentions: { parse: [] } };
    let message = null;
    let wasUpdated = false;

    if (allowUpdate && event.report_message_id) {
        const existingMsg = await channel.messages.fetch(event.report_message_id).catch(() => null);
        if (!existingMsg) throw new Error('El reporte original fue eliminado o no es accesible. No se ha creado un duplicado.');
        if (existingMsg) {
            message = await existingMsg.edit(payload);
            wasUpdated = true;
        }
    }

    if (!message) {
        if (template.sticker_id) payload.stickers = [template.sticker_id];
        try {
            message = await channel.send(payload);
        } catch (error) {
            if (!payload.stickers) throw error;
            delete payload.stickers;
            message = await channel.send(payload);
        }
    }

    economyDb.saveEventReport(event.id, message.id, {
        template: template.name,
        evidence_url: evidence?.url || '',
        result: effectiveResult || '',
        notes: effectiveNotes || '',
        sector_ao: sectorAo,
        server_used: serverUsed,
        mission_rating: missionRating,
        casualties_stats: casualtiesStats,
        co_host_id: finalizationDraft.co_host_id || '',
        mvp_id: finalizationDraft.mvp_id || '',
        teams: finalizationDraft.teams || {},
        officer_id: interaction.user.id,
        updated_at: new Date().toISOString()
    }, channel.id);

    return { message, channel, updated: wasUpdated };
}

async function publishEventCompletionNotice(interaction, event, details, settings) {
    if (event.completion_message_id) return { sent: false, skipped: true };
    const channel = interaction.channel;
    if (!channel?.isSendable?.()) return { sent: false, error: 'El canal del comando no permite enviar mensajes.' };
    const isTraining = event.event_type === 'TRAINING';
    const sym = settings?.currency_symbol || '$';
    const finalizationDraft = economyDb.getEventFinalizationDraft(event.id) || {};
    const directorDisplay = finalizationDraft.director_id ? `<@${finalizationDraft.director_id}>` : (finalizationDraft.director_name || `<@${interaction.user.id}>`);
    const embed = new EmbedBuilder()
        .setColor(0x38e54d)
        .setTitle(isTraining
            ? `✅ [ENTRENAMIENTO FINALIZADO // #${event.id}]`
            : `✅ [OPERACIÓN PAGADA // #${event.id}]`)
        .setDescription(isTraining
            ? [
                `> 🎓 **Entrenamiento:** \`${event.name}\``,
                `> 🏅 **Rol entregado:** ${details.role}`,
                `> ✅ **Nuevas asignaciones:** \`${details.awarded.length}\``,
                `> 🛡️ **Ya tenían el rol:** \`${details.alreadyHadRole.length}\``,
                `> 👥 **Aprobados en lista:** \`${details.rosterCount}\``,
                details.failed.length ? `> ⚠️ **Asignaciones pendientes:** \`${details.failed.length}\`` : null,
                `> 👤 **Encargado:** ${directorDisplay}`
            ].filter(Boolean).join('\n')
            : [
                `> 🎖️ **Operación:** \`${event.name}\``,
                `> ✅ **Estado:** \`PAGO COMPLETADO\``,
                `> 👥 **Combatientes pagados:** \`${details.paidCount}\``,
                `> 💰 **Total desembolsado:** \`${sym}${details.totalDistributed.toLocaleString()}\``,
                `> 👤 **Encargado:** ${directorDisplay}`
            ].join('\n'))
        .setFooter({ text: isTraining ? 'Comunidad • Roles de entrenamiento entregados' : 'Tesorería Militar Comunidad • Liquidación completada' })
        .setTimestamp();

    try {
        const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        economyDb.saveEventCompletionNotice(event.id, channel.id, message.id);
        return { sent: true, message };
    } catch (error) {
        return { sent: false, error: error.message };
    }
}

async function completeEventFinalization(interaction, active) {
    const draft = economyDb.getEventFinalizationDraft(active.id) || {};
    const evidence = draft.evidence || null;
    const resultText = draft.result || '';
    const notes = draft.notes || '';
    const isEditing = Boolean(draft.is_editing_report);
    const settings = economyDb.getEconomySettings(active.guild_id);
    const sym = settings.currency_symbol || '$';

    try {
        let releasedServers = [];

        if (isEditing && active.status === 'ENDED') {
            const report = await publishEventReport(interaction, active, { paidCount: 0, totalDistributed: 0 }, evidence, resultText, notes, true);
            db.addAdminAuditLog(
                { operator_name: interaction.user.tag, discord_id: interaction.user.id, operator_rank: 'Oficial Discord' },
                'EDITAR_REPORTE_EVENTO',
                `EVENTO #${active.id}`,
                `Reporte actualizado para ${active.name}`
            );
            return interaction.editReply({
                content: `💾 **Registro oficial del Evento #${active.id} (${active.name}) actualizado con éxito** en ${report.channel || 'el canal de actas'}.`,
                embeds: [],
                components: []
            });
        }

        if (active.event_type === 'TRAINING') {
            const summary = await awardTrainingRole(interaction, active);
            releasedServers = db.releasePrivateServerByEventId(active.id, active.guild_id);
            if (releasedServers.length) await refreshPublicServerBoard(interaction.client, active.guild_id);
            const completionNotice = await publishEventCompletionNotice(interaction, active, summary, settings);
            const report = await publishEventReport(interaction, active, { paidCount: 0, totalDistributed: 0 }, evidence, resultText, notes, true);
            const failedPreview = summary.failed.slice(0, 5).map(item => `<@${item.discordId}>`).join(', ');
            const retryText = summary.failed.length > 0
                ? `\n⚠️ No se pudo asignar a **${summary.failed.length}** miembro(s): ${failedPreview}${summary.failed.length > 5 ? '…' : ''}. Puedes corregir el problema y repetir \`/evento finalizar evento_id:${active.id}\`.`
                : '';
            return interaction.editReply({
                content: `✅ **Entrenamiento #${active.id} finalizado.** Rol ${summary.role} entregado a **${summary.awarded.length}** aprobado(s); **${summary.alreadyHadRole.length}** ya lo tenían. Total en la lista final: **${summary.rosterCount}**.${retryText}${report.channel ? `\n📜 Registro publicado en ${report.channel}.` : ''}${releasedServers.length ? `\n🟢 Servidor privado liberado automáticamente.` : ''}${completionNotice.sent ? '\n📣 Aviso de cierre publicado en este canal.' : completionNotice.skipped ? '\n📣 El aviso de cierre ya estaba publicado.' : `\n⚠️ No pude publicar el aviso público: ${completionNotice.error}`}`,
                embeds: [],
                components: []
            });
        }

        const summary = economyDb.massPayoutEvent(active.id, interaction.client, interaction.user.id);
        if (!summary.success) return interaction.editReply({ content: `⚠️ ${summary.message}`, embeds: [], components: [] });


            releasedServers = db.releasePrivateServerByEventId(active.id, active.guild_id);
            if (releasedServers.length) await refreshPublicServerBoard(interaction.client, active.guild_id);
        let previewPaid = summary.paidList.slice(0, 10)
            .map(p => `• <@${p.discord_id}>: **${sym}${p.amount.toLocaleString()}** [${p.role || 'Estándar'}]`)
            .join('\n');
        if (!previewPaid) previewPaid = '*No hubo asistentes elegibles pendientes de pago.*';
        if (summary.paidList.length > 10) previewPaid += `\n*...y ${summary.paidList.length - 10} soldados más.*`;
        const completionNotice = await publishEventCompletionNotice(interaction, active, summary, settings);
        const report = await publishEventReport(interaction, active, summary, evidence, resultText, notes, true);
        const embed = new EmbedBuilder()
            .setColor(0x38e54d)
            .setTitle(`✅ [OPERACIÓN FINALIZADA Y PAGADA // #${active.id}]`)
            .setDescription(`> 🎖️ **Operación:** \`${active.name}\`\n> 👥 **Combatientes pagados:** \`${summary.paidCount}\`\n> 💰 **Total desembolsado:** \`${sym}${summary.totalDistributed.toLocaleString()}\`\n${report.channel ? `> 📜 **Registro oficial:** ${report.channel}` : ''}${releasedServers.length ? `\n> 🟢 **Servidor Liberado:** \`${releasedServers.map(s => s.server_name).join(', ')}\`` : ''}\n\n${previewPaid}`)
            .setFooter({ text: 'Tesorería Militar Comunidad • Cierre y liquidación automática' })
            .setTimestamp();
        return interaction.editReply({
            content: completionNotice.sent ? '📣 Aviso de cierre publicado en este canal.' : completionNotice.skipped ? '📣 El aviso de cierre ya estaba publicado.' : `⚠️ El evento terminó, pero no pude publicar el aviso público: ${completionNotice.error}`,
            embeds: [embed],
            components: []
        });
    } catch (error) {
        return interaction.editReply({ content: `❌ Error al finalizar la operación: ${error.message}`, embeds: [], components: [] });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('evento')
        .setDescription('Gestión táctica de operaciones comunitarios, registro previo, asistencia y pagos')
        .addSubcommand(sub =>
            sub.setName('convocar')
                .setDescription('Inicia una operación comunitario por registro previo y publica el panel de alistamiento')
                .addStringOption(opt => opt.setName('nombre').setDescription('Nombre de la operación').setRequired(true))
                .addIntegerOption(opt => opt.setName('paga_base').setDescription('Recompensa base en créditos').setMinValue(1).setRequired(true))
                .addIntegerOption(opt => opt.setName('plantilla_id').setDescription('Obligatoria: patrullaje #3, operación #4 u otra plantilla').setMinValue(1).setRequired(true))
                .addChannelOption(opt => opt.setName('canal_registro').setDescription('Canal donde publicar el panel de inscripción').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addIntegerOption(opt => opt.setName('cupo_maximo').setDescription('Límite de soldados (opcional, por defecto sin límite)').setMinValue(1).setRequired(false))
                .addIntegerOption(opt => opt.setName('servidor_id').setDescription('ID del servidor privado la comunidad para marcarlo EN USO automáticamente').setMinValue(1).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('entrenamiento')
                .setDescription('Crea un entrenamiento y entrega un rol a quienes permanezcan aprobados en la lista')
                .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del entrenamiento').setRequired(true))
                .addRoleOption(opt => opt.setName('rol').setDescription('Rol que recibirán los aprobados').setRequired(true))
                .addIntegerOption(opt => opt.setName('plantilla_id').setDescription('Obligatoria: usa la plantilla de entrenamiento #2').setMinValue(1).setRequired(true))
                .addChannelOption(opt => opt.setName('canal_registro').setDescription('Canal donde publicar el panel de inscripción').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addIntegerOption(opt => opt.setName('cupo_maximo').setDescription('Límite de participantes (opcional)').setMinValue(1).setRequired(false))
                .addIntegerOption(opt => opt.setName('servidor_id').setDescription('ID del servidor privado la comunidad para marcarlo EN USO automáticamente').setMinValue(1).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('lista')
                .setDescription('Visualiza el pase de lista táctico en tiempo real (con paginación y expulsión)')
                .addIntegerOption(opt => opt.setName('evento_id').setDescription('ID del evento activo o finalizado que deseas revisar').setMinValue(1).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('iniciar')
                .setDescription('Inicia el rastreo automático de presencia para operaciones en canales de voz/chat')
                .addStringOption(opt => opt.setName('nombre').setDescription('Nombre de la operación o evento').setRequired(true))
                .addStringOption(opt => opt.setName('tipo').setDescription('Modalidad de rastreo').addChoices(
                    { name: 'Canal de Voz (Voice Attendance)', value: 'VOICE' },
                    { name: 'Canal de Chat (Text Activity)', value: 'TEXT' },
                    { name: 'Híbrido (Voz + Chat)', value: 'HYBRID' }
                ).setRequired(true))
                .addChannelOption(opt => opt.setName('canal_objetivo').setDescription('Canal de voz o chat donde se medirá la presencia').setRequired(true))
                .addIntegerOption(opt => opt.setName('paga_base').setDescription('Recompensa base en créditos').setMinValue(1).setRequired(true))
                .addIntegerOption(opt => opt.setName('plantilla_id').setDescription('Obligatoria: operación #4 u otra plantilla compatible').setMinValue(1).setRequired(true))
                .addIntegerOption(opt => opt.setName('gracia_minutos').setDescription('Tolerancia en minutos si sufren desconexión (default: 5 min)').setMinValue(0).setRequired(false))
                .addIntegerOption(opt => opt.setName('asistencia_minima').setDescription('Porcentaje mínimo de permanencia requerido (default: 80%)').setMinValue(10).setMaxValue(100).setRequired(false))
                .addIntegerOption(opt => opt.setName('servidor_id').setDescription('ID del servidor privado la comunidad para marcarlo EN USO automáticamente').setMinValue(1).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('finalizar')
                .setDescription('Concluye la operación, prepara el registro (Autolog la comunidad) y paga a los aprobados')
                .addIntegerOption(opt => opt.setName('evento_id').setDescription('ID del evento; necesario cuando hay varios activos').setMinValue(1).setRequired(false))
                .addAttachmentOption(opt => opt.setName('evidencia').setDescription('Captura o fotografía para el acta oficial').setRequired(false))
                .addStringOption(opt => opt.setName('resultado').setDescription('Resultado u objetivos de la operación').setMaxLength(900).setRequired(false))
                .addStringOption(opt => opt.setName('notas').setDescription('Observaciones adicionales para el registro').setMaxLength(900).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('editar-reporte')
                .setDescription('Abre el editor interactivo para modificar el registro/autolog de un evento y actualizarlo')
                .addIntegerOption(opt => opt.setName('evento_id').setDescription('ID del evento cuyo registro deseas editar o republicar').setMinValue(1).setRequired(true))
                .addAttachmentOption(opt => opt.setName('evidencia').setDescription('Nueva captura o fotografía (opcional)').setRequired(false))
                .addStringOption(opt => opt.setName('resultado').setDescription('Nuevo resultado u objetivos (opcional)').setMaxLength(900).setRequired(false))
                .addStringOption(opt => opt.setName('notas').setDescription('Nuevas observaciones (opcional)').setMaxLength(900).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('estado')
                .setDescription('Verifica los participantes y estado en tiempo real de la operación activa')
                .addIntegerOption(opt => opt.setName('evento_id').setDescription('ID del evento; necesario cuando hay varios activos').setMinValue(1).setRequired(false))
        ),

    buildRegistrationPanel,
    buildConfirmationPanel,
    buildPayoutPanel,
    buildEventRosterPanel,
    buildEventPicker,
    buildEventFinalizationPanel,
    createEventFinalizationDraft,
    completeEventFinalization,
    EVENT_REPORT_TEAMS,
    publishEventReport,

    async execute(interaction) {
        const respond = payload => interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
        if (!hasOfficerPermission(interaction)) {
            return respond({
                content: '❌ **Acceso Restringido:** Solo el cuerpo de responsables y administradores puede comandar eventos de pago.',
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.guildId || 'GLOBAL';
        const sub = interaction.options.getSubcommand();
        const settings = economyDb.getEconomySettings(guildId);
        const sym = settings.currency_symbol || '$';
        const officerName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;

        // ==========================================
        // 1. /evento convocar (NUEVO: Panel de Registro)
        // ==========================================
        if (sub === 'convocar') {
            const name = interaction.options.getString('nombre');
            const baseReward = interaction.options.getInteger('paga_base');
            const regChannel = interaction.options.getChannel('canal_registro') || interaction.channel;
            const maxParticipants = interaction.options.getInteger('cupo_maximo') || 0;
            const templateId = interaction.options.getInteger('plantilla_id');
            const serverId = interaction.options.getInteger('servidor_id');

            if (!templateId) {
                return respond({ content: '❌ Debes seleccionar una plantilla: patrullaje `#3` u operación `#4`.', flags: MessageFlags.Ephemeral });
            }

            if (!regChannel.isTextBased()) {
                return respond({
                    content: '❌ El canal de registro debe ser un canal de texto.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (serverId) {
                const srv = db.getPrivateServerById(serverId, guildId);
                if (!srv) {
                    return respond({ content: `⚠️ No existe el servidor privado #${serverId}. Consulta \`/servidor lista\`.`, flags: MessageFlags.Ephemeral });
                }
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const result = economyDb.createEvent({
                guild_id: guildId,
                name,
                event_type: 'REGISTRATION',
                target_channel_id: regChannel.id,
                payout_channel_id: regChannel.id,
                registration_channel_id: regChannel.id,
                confirmation_channel_id: regChannel.id,
                base_reward: baseReward,
                max_participants: maxParticipants,
                phase: 'REGISTRATION',
                report_template_id: templateId,
                created_by_id: interaction.user.id,
                created_by_name: officerName,
                private_server_id: serverId || null
            });

            if (!result.success) {
                return respond({ content: `⚠️ ${result.message}`, flags: MessageFlags.Ephemeral });
            }

            let serverNotice = '';
            if (serverId) {
                const occ = { success: true, server: db.getPrivateServerById(serverId, guildId) };
                if (occ.success) {
                    serverNotice = `\n🛰️ **Servidor Privado en Uso:** \`${occ.server.server_name}\` marcado con casilla \`[🔴 ESTÁ USADO]\`.`;
                    await refreshPublicServerBoard(interaction.client, guildId);
                }
            }

            const panelData = buildRegistrationPanel(result.event, settings);

            try {
                const sentMsg = await regChannel.send(panelData);
                economyDb.setEventPhase(result.event.id, 'REGISTRATION', {
                    registration_channel_id: regChannel.id,
                    registration_message_id: sentMsg.id
                });

                return respond({
                    content: `🎖️ **Convocatoria Militar activada.** Panel de registro desplegado exitosamente en <#${regChannel.id}>. (Operación #${result.event.id}: **${name}**)${serverNotice}`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (err) {
                economyDb.cancelUnpublishedEvent(result.event.id, guildId);
                await refreshPublicServerBoard(interaction.client, guildId);
                return respond({
                    content: `❌ Error al enviar el panel a <#${regChannel.id}>: ${err.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // ==========================================
        // /evento entrenamiento (Registro + rol para aprobados)
        // ==========================================
        if (sub === 'entrenamiento') {
            const name = interaction.options.getString('nombre');
            const rewardRole = interaction.options.getRole('rol');
            const regChannel = interaction.options.getChannel('canal_registro') || interaction.channel;
            const maxParticipants = interaction.options.getInteger('cupo_maximo') || 0;
            const templateId = interaction.options.getInteger('plantilla_id');
            const serverId = interaction.options.getInteger('servidor_id');

            if (!templateId) {
                return respond({ content: '❌ Debes seleccionar la plantilla de entrenamiento `#2`.', flags: MessageFlags.Ephemeral });
            }

            if (!regChannel.isTextBased()) {
                return respond({ content: '❌ El canal de registro debe ser un canal de texto.', flags: MessageFlags.Ephemeral });
            }
            if (rewardRole.managed || !rewardRole.editable) {
                return respond({
                    content: `❌ No puedo entregar ${rewardRole}. Mi rol debe estar por encima y debo tener permiso para gestionar roles.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const result = economyDb.createEvent({
                guild_id: guildId,
                name,
                event_type: 'TRAINING',
                target_channel_id: regChannel.id,
                payout_channel_id: regChannel.id,
                registration_channel_id: regChannel.id,
                confirmation_channel_id: regChannel.id,
                base_reward: 0,
                max_participants: maxParticipants,
                phase: 'REGISTRATION',
                reward_role_id: rewardRole.id,
                report_template_id: templateId,
                created_by_id: interaction.user.id,
                created_by_name: officerName,
                private_server_id: serverId || null
            });

            if (!result.success) {
                return respond({ content: `⚠️ ${result.message}`, flags: MessageFlags.Ephemeral });
            }

            let serverNotice = '';
            if (serverId) {
                const occ = { success: true, server: db.getPrivateServerById(serverId, guildId) };
                if (occ.success) {
                    serverNotice = `\n🛰️ **Servidor Privado en Uso:** \`${occ.server.server_name}\` marcado con casilla \`[🔴 ESTÁ USADO]\`.`;
                    await refreshPublicServerBoard(interaction.client, guildId);
                }
            }

            const panelData = buildRegistrationPanel(result.event, settings);
            try {
                const sentMsg = await regChannel.send(panelData);
                economyDb.setEventPhase(result.event.id, 'REGISTRATION', {
                    registration_channel_id: regChannel.id,
                    registration_message_id: sentMsg.id
                });
                return respond({
                    content: `🎓 **Entrenamiento #${result.event.id} creado.** Registro publicado en <#${regChannel.id}> y rol para aprobados: ${rewardRole}.${serverNotice}`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (err) {
                economyDb.cancelUnpublishedEvent(result.event.id, guildId);
                await refreshPublicServerBoard(interaction.client, guildId);
                return respond({ content: `❌ Error al publicar el entrenamiento: ${err.message}`, flags: MessageFlags.Ephemeral });
            }
        }

        // ==========================================
        // 5. /evento lista (Reporte Táctico Paginado con Expulsión)
        // ==========================================
        if (sub === 'lista') {
            const requestedId = interaction.options.getInteger('evento_id');
            if (requestedId) {
                const event = economyDb.getEventById(requestedId);
                if (!event || (event.guild_id !== guildId && event.guild_id !== 'GLOBAL')) {
                    return respond({ content: `⚠️ No existe el evento #${requestedId} en este servidor.`, flags: MessageFlags.Ephemeral });
                }
                const panel = buildEventRosterPanel(event, 1, settings);
                return respond({ ...panel, flags: MessageFlags.Ephemeral });
            }

            const events = economyDb.getRecentEvents(guildId, 25);
            if (events.length === 0) {
                return respond({
                    content: 'ℹ️ No hay operaciones disponibles para consultar.',
                    flags: MessageFlags.Ephemeral
                });
            }
            return respond({ ...buildEventPicker(events), flags: MessageFlags.Ephemeral });
        }

        // ==========================================
        // 6. /evento iniciar (Existente: Voz/Chat Auto)
        // ==========================================
        if (sub === 'iniciar') {
            const name = interaction.options.getString('nombre');
            const eventType = interaction.options.getString('tipo');
            const targetChannel = interaction.options.getChannel('canal_objetivo');
            const baseReward = interaction.options.getInteger('paga_base');
            const graceMinutes = interaction.options.getInteger('gracia_minutos') !== null ? interaction.options.getInteger('gracia_minutos') : 5;
            const minPercent = interaction.options.getInteger('asistencia_minima') || 80;
            const templateId = interaction.options.getInteger('plantilla_id');
            const serverId = interaction.options.getInteger('servidor_id');

            if (!templateId) {
                return respond({ content: '❌ Debes seleccionar una plantilla de registro; para operaciones usa `#4`.', flags: MessageFlags.Ephemeral });
            }

            if (eventType === 'VOICE' && !targetChannel.isVoiceBased()) {
                return respond({
                    content: '❌ Para una operación de **Voz**, el `canal_objetivo` debe ser un canal de voz.',
                    flags: MessageFlags.Ephemeral
                });
            }
            if (eventType === 'TEXT' && !targetChannel.isTextBased()) {
                return respond({
                    content: '❌ Para una operación de **Chat**, el `canal_objetivo` debe ser un canal de texto.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const result = economyDb.createEvent({
                guild_id: guildId,
                name,
                event_type: eventType,
                target_channel_id: targetChannel.id,
                payout_channel_id: targetChannel.id,
                base_reward: baseReward,
                grace_period_minutes: graceMinutes,
                min_attendance_percent: minPercent,
                report_template_id: templateId,
                created_by_id: interaction.user.id,
                created_by_name: officerName,
                private_server_id: serverId || null
            });

            if (!result.success) {
                return respond({ content: `⚠️ ${result.message}`, flags: MessageFlags.Ephemeral });
            }

            let serverLine = '';
            if (serverId) {
                const occ = { success: true, server: db.getPrivateServerById(serverId, guildId) };
                if (occ.success) {
                    serverLine = `\n> 🛰️ **Servidor Privado:** \`${occ.server.server_name}\` (\`[🔴 ESTÁ USADO]\`)`;
                    await refreshPublicServerBoard(interaction.client, guildId);
                }
            }

            if (eventType === 'VOICE' || eventType === 'HYBRID') {
                if (targetChannel.isVoiceBased()) {
                    for (const [mId, member] of targetChannel.members) {
                        if (!member.user.bot) {
                            economyDb.recordAttendanceHeartbeat(result.event.id, mId, member.user.tag, 10);
                        }
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x38e54d)
                .setTitle(`🔴 [OPERACIÓN INICIADA] // ${name.toUpperCase()}`)
                .setDescription(`
El rastreo de presencia comunitario ha sido activado exitosamente.

> 📍 **Canal Objetivo:** <#${targetChannel.id}> (\`${eventType}\`)${serverLine}
> 💰 **Recompensa Base:** \`${sym}${baseReward.toLocaleString()}\`
> 🛡️ **Tolerancia a Desconexión:** \`${graceMinutes} minutos\`
> 📊 **Permanencia Requerida:** \`${minPercent}%\`
> ⚡ **Liquidación:** \`Automática al finalizar\`
                `)
                .setFooter({ text: `Operación ID: #${result.event.id} • Ejecuta /evento finalizar al terminar.` });

            return respond({ embeds: [embed] });
        }

        // ==========================================
        // 7. /evento estado (Existente: Monitor en vivo)
        // ==========================================
        if (sub === 'estado') {
            const resolved = resolveActiveEvent(guildId, interaction.options.getInteger('evento_id'));
            if (!resolved.event) return respond({ content: `ℹ️ ${resolved.error}`, flags: MessageFlags.Ephemeral });
            const active = resolved.event;

            const attendees = economyDb.getEventAttendance(active.id);
            const durationMinutes = Math.floor((Date.now() - new Date(active.created_at).getTime()) / 60000);

            let previewAttendees = 'Ningún recluta registrado aún.';
            if (attendees.length > 0) {
                previewAttendees = attendees.slice(0, 15).map(a => {
                    const mins = Math.floor(a.total_seconds_present / 60);
                    let badge = '';
                    if (a.attendance_confirmed) badge = ' [✅ Confirmado]';
                    else if (a.status === 'REGISTERED') badge = ' [📝 Inscrito]';

                    return `• <@${a.discord_id}> — ${mins} min ${a.message_count > 0 ? `(${a.message_count} msgs)` : ''}${badge}`;
                }).join('\n');
                if (attendees.length > 15) previewAttendees += `\n*...y ${attendees.length - 15} miembros más.*`;
            }

            const embed = new EmbedBuilder()
                .setColor(0xffb000)
                .setTitle(`📡 [MONITOREO DE OPERACIÓN EN VIVO // #${active.id}]`)
                .setDescription(`
**Misión:** ${active.name}
> 📍 **Modalidad:** \`${active.event_type}\` (Fase: \`${active.phase || active.status}\`)
> ⏱️ **Tiempo Transcurrido:** \`${durationMinutes} minutos\`
> 👥 **Miembros Registrados:** \`${attendees.length}\`
> 💰 **Paga Base:** \`${sym}${active.base_reward.toLocaleString()}\`

**Personal en Registro:**
${previewAttendees}
                `)
                .setFooter({ text: 'Revisa /evento lista y usa /evento finalizar para liquidar la operación.' });

            return respond({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // ==========================================
        // 8. /evento finalizar (Existente: Auto tracker)
        // ==========================================
        if (sub === 'finalizar') {
            const requestedId = interaction.options.getInteger('evento_id');
            const evidence = interaction.options.getAttachment('evidencia');
            const resultText = interaction.options.getString('resultado');
            const notes = interaction.options.getString('notas');
            let active;
            if (requestedId) {
                active = economyDb.getEventById(requestedId);
                if (!active || (active.guild_id !== guildId && active.guild_id !== 'GLOBAL')) {
                    return respond({ content: `⚠️ No existe el evento #${requestedId} en este servidor.`, flags: MessageFlags.Ephemeral });
                }
                if (active.status !== 'ACTIVE' && active.event_type !== 'TRAINING' && active.report_message_id && active.completion_message_id) {
                    return respond({ content: `⚠️ El evento #${requestedId} ya está finalizado. Usa \`/evento editar-reporte evento_id:${requestedId}\` si deseas modificar su registro.`, flags: MessageFlags.Ephemeral });
                }
            } else {
                const resolved = resolveActiveEvent(guildId, null);
                if (!resolved.event) return respond({ content: `⚠️ ${resolved.error}`, flags: MessageFlags.Ephemeral });
                active = resolved.event;
            }

            const reportTemplate = getReportTemplate(active);
            if (reportTemplate.evidence_required && !evidence) {
                return respond({ content: `📸 La plantilla **${reportTemplate.name}** exige una evidencia. Adjunta una imagen en la opción \`evidencia\`.`, flags: MessageFlags.Ephemeral });
            }
            if (evidence && !evidence.contentType?.startsWith('image/')) {
                return respond({ content: '❌ La evidencia debe ser una imagen válida.', flags: MessageFlags.Ephemeral });
            }

            const draft = createEventFinalizationDraft(active, interaction, evidence, resultText, notes, false);
            economyDb.saveEventFinalizationDraft(active.id, draft);
            return respond({
                ...buildEventFinalizationPanel(active, draft),
                flags: MessageFlags.Ephemeral
            });
        }

        // ==========================================
        // 9. /evento editar-reporte (NUEVO: Edición post-envío de Autolog la comunidad)
        // ==========================================
        if (sub === 'editar-reporte') {
            const requestedId = interaction.options.getInteger('evento_id');
            const evidence = interaction.options.getAttachment('evidencia');
            const resultText = interaction.options.getString('resultado');
            const notes = interaction.options.getString('notas');

            const targetEvent = economyDb.getEventById(requestedId);
            if (!targetEvent || (targetEvent.guild_id !== guildId && targetEvent.guild_id !== 'GLOBAL')) {
                return respond({ content: `⚠️ No existe el evento #${requestedId} en este servidor.`, flags: MessageFlags.Ephemeral });
            }
            if (targetEvent.status !== 'ENDED' || !targetEvent.report_message_id) {
                return respond({ content: 'Solo se pueden reeditar eventos finalizados con un reporte publicado.', flags: MessageFlags.Ephemeral });
            }
            if (evidence && !evidence.contentType?.startsWith('image/')) {
                return respond({ content: '❌ La evidencia debe ser una imagen válida.', flags: MessageFlags.Ephemeral });
            }

            const draft = createEventFinalizationDraft(targetEvent, interaction, evidence, resultText, notes, true);
            economyDb.saveEventFinalizationDraft(targetEvent.id, draft);
            return respond({
                ...buildEventFinalizationPanel(targetEvent, draft),
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
