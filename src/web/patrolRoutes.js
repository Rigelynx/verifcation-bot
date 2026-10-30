const path = require('path');
const db = require('../database/db');
const eco = require('../database/economyDb');
const events = require('../bot/commands/eventos');
const { refreshPublicServerBoard } = require('../bot/commands/servidor');
const locks = new Set();
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const text = (value, max = 500) => String(value || '').trim().slice(0, max);
function installPatrolRoutes(app, client, auth) {
    app.get('/patrullas', (req, res) => res.sendFile(path.join(__dirname, 'views/patrol.html')));
    app.use('/api/patrol', auth.requireAccess('patrol'));
    const route = fn => async (req, res) => {
        try { await fn(req, res); }
        catch (error) { console.error('[Patrol API]', error.message); res.status(error.status || 500).json({ success: false, message: error.message }); }
    };
    function eventFor(req, manage = false) {
        const event = eco.getEventById(Number(req.params.id));
        if (!event || event.guild_id !== req.discordIdentity.guildId) fail(404, 'Evento no encontrado.');
        if (manage && !canManage(req.discordIdentity, event)) fail(403, 'Solo el responsable de este evento o Alto Mando puede modificarlo.');
        return event;
    }
    const canManage = (user, event) => user.access.admin || String(event.created_by_id) === user.id;
    function command(req, key) {
        if (!eco.isCommandAllowed(key, req.discordIdentity.member).allowed) fail(403, 'El protocolo está desactivado o tu rol no puede utilizarlo.');
    }
    function actor(req, action, event, details) { db.addAdminAuditLog(req.adminOperator, action, String(event.id), details); }
    function publicEvent(user, event) {
        return { id: event.id, name: event.name, type: event.event_type, status: event.status, phase: event.phase,
            created_at: event.created_at, ended_at: event.ended_at, officer_id: event.created_by_id, officer_name: event.created_by_name,
            server_id: event.private_server_id, channel_id: event.registration_channel_id || event.target_channel_id,
            base_reward: event.base_reward, report_message_id: event.report_message_id, report_channel_id: event.report_channel_id,
            can_manage: canManage(user, event), can_take_roll: event.status === 'ACTIVE' && String(event.created_by_id) === user.id };
    }
    function snapshot(event) {
        const draft = eco.getEventFinalizationDraft(event.id);
        if (draft) return draft;
        try { return JSON.parse(event.report_data || '{}'); } catch { return {}; }
    }
    function interaction(req, event) {
        const user = req.discordIdentity;
        const channel = user.guild.channels.cache.get(event.registration_channel_id || event.payout_channel_id || event.target_channel_id)
            || user.guild.systemChannel;
        return { guild: user.guild, guildId: user.guildId, member: user.member, client,
            user: { id: user.id, tag: user.username, username: user.username }, channel, channelId: channel?.id,
            reportOfficerLabel: user.username };
    }
    function channelFor(req, id) {
        const channel = req.discordIdentity.guild.channels.cache.get(id);
        if (!channel?.isTextBased() || !channel.permissionsFor(req.discordIdentity.member)?.has(['ViewChannel', 'SendMessages'])) fail(403, 'No puedes publicar en ese canal.');
        return channel;
    }
    async function exclusive(id, work) {
        if (locks.has(id)) fail(409, 'Hay otra acción en curso para este evento. Espera y sincroniza.');
        locks.add(id);
        try { return await work(); } finally { locks.delete(id); }
    }
    app.get('/api/patrol/resources', route(async (req, res) => {
        const user = req.discordIdentity;
        const templates = eco.getEventReportTemplates(user.guildId).map(t => ({ id: t.id, name: t.name, template_kind: t.template_kind }));
        const channels = [...user.guild.channels.cache.values()].filter(c => c.isTextBased() && c.permissionsFor(user.member)?.has(['ViewChannel', 'SendMessages']))
            .map(c => ({ id: c.id, name: c.name }));
        res.json({ success: true, templates, channels, teams: events.EVENT_REPORT_TEAMS,
            servers: db.getPrivateServers(user.guildId) });
    }));
    app.get('/api/patrol/events', route(async (req, res) => {
        const user = req.discordIdentity, history = req.query.history === 'true';
        const list = history ? eco.getEventHistory(user.guildId, 50, 0) : eco.getActiveEvents(user.guildId);
        res.json({ success: true, events: list.filter(event => event.guild_id === user.guildId).map(event => ({ ...publicEvent(user, event),
            participants: eco.getEventRegistrations(event.id).length })) });
    }));
    app.get('/api/patrol/events/:id', route(async (req, res) => {
        const event = eventFor(req), page = Math.max(1, Number(req.query.page) || 1);
        const roster = eco.getEventRegistrationsPage(event.id, page, 25, true);
        roster.attendees = roster.attendees.map(member => ({ discord_id: member.discord_id, username: member.username,
            avatar: member.avatar, status: member.status, claimed: member.claimed, attendance_confirmed: member.attendance_confirmed,
            roll_call_status: member.roll_call_status, roll_call_by: member.roll_call_by, roll_call_at: member.roll_call_at }));
        const all = eco.getEventRegistrations(event.id);
        const rollCall = { total: all.length, present: 0, absent: 0, no_response: 0, pending: 0 };
        const counts = { PRESENT: 'present', ABSENT: 'absent', NO_RESPONSE: 'no_response' };
        for (const member of all) rollCall[counts[member.roll_call_status] || 'pending']++;
        // Financial account data and unrelated admin settings are not part of this API.
        res.json({ success: true, event: publicEvent(req.discordIdentity, event), report: snapshot(event), roster, roll_call: rollCall });
    }));
    app.put('/api/patrol/events/:id/roll-call', route(async (req, res) => {
        command(req, 'evento:lista');
        const event = eventFor(req);
        if (String(event.created_by_id) !== req.discordIdentity.id) fail(403, 'Solo el encargado del evento puede pasar lista.');
        if (event.status !== 'ACTIVE') fail(409, 'El pase de lista está cerrado.');
        const id = String(req.body.discord_id || ''), state = req.body.state;
        if (!/^\d{17,20}$/.test(id) || !['PRESENT', 'ABSENT', 'NO_RESPONSE'].includes(state)) fail(400, 'Participante o estado de asistencia inválido.');
        await exclusive(event.id, async () => {
            const before = eco.getUserEventRecord(event.id, id);
            const result = eco.setEventRollCall(event.id, id, state, req.discordIdentity.id);
            if (!result.success) fail(409, result.message);
            actor(req, 'PASAR_LISTA_WEB', event, `${id}: ${before?.roll_call_status || 'PENDING'} → ${state}`);
            res.json({ success: true });
        });
    }));
    app.post('/api/patrol/events', route(async (req, res) => {
        command(req, 'evento:convocar');
        const user = req.discordIdentity, body = req.body || {};
        const name = text(body.name, 120), reward = Number(body.base_reward || 0), template = Number(body.template_id);
        if (!name || !Number.isSafeInteger(reward) || reward < 0 || reward > 1000000 || !Number.isSafeInteger(template)) fail(400, 'Revisa el nombre, la paga y la plantilla.');
        const channel = channelFor(req, String(body.channel_id));
        const result = eco.createEvent({ guild_id: user.guildId, name, event_type: 'REGISTRATION', base_reward: reward,
            target_channel_id: channel.id, registration_channel_id: channel.id, payout_channel_id: channel.id,
            phase: 'REGISTRATION', report_template_id: template, private_server_id: Number(body.server_id) || null,
            created_by_id: user.id, created_by_name: user.username });
        if (!result.success) fail(409, result.message);
        actor(req, 'CREAR_PATRULLA_WEB', result.event, name);
        await refreshPublicServerBoard(client, user.guildId);
        res.json({ success: true, event: publicEvent(user, result.event) });
    }));
    app.post('/api/patrol/events/:id/participants', route(async (req, res) => {
        command(req, 'evento:finalizar');
        const event = eventFor(req, true);
        if (event.status !== 'ACTIVE') fail(409, 'La lista de asistencia ya está cerrada. Edita el reporte para una corrección documental.');
        const raw = String(req.body.ids || '');
        const ids = [...new Set(raw.match(/(?<!\d)\d{17,20}(?!\d)/g) || [])];
        if (!ids.length || ids.length > 50) fail(400, 'Pega entre 1 y 50 IDs o menciones de Discord.');
        const removing = req.body.action === 'remove';
        const names = {};
        for (let i = 0; !removing && i < ids.length; i += 5) {
            await Promise.all(ids.slice(i, i + 5).map(async id => {
                const member = await req.discordIdentity.guild.members.fetch(id).catch(() => null);
                if (!member || member.user?.bot) fail(400, `El ID ${id} no corresponde a un participante del servidor.`);
                names[id] = member.displayName || member.user.username;
            }));
        }
        if (removing) {
            const registered = new Set(eco.getEventRegistrations(event.id, true).map(member => String(member.discord_id)));
            if (ids.some(id => !registered.has(id))) fail(400, 'Solo puedes retirar IDs que están en el evento.');
        }
        if (locks.has(event.id) || eco.getEventById(event.id).status !== 'ACTIVE') fail(409, 'La operación se está cerrando. Sincroniza antes de modificar participantes.');
        eco.syncEventParticipantsByIds(event.id, removing ? [] : ids, removing ? ids : [], names);
        if (removing) {
            const draft = eco.getEventFinalizationDraft(event.id);
            if (draft) {
                for (const team of Object.values(draft.teams || {})) {
                    team.members = team.members.filter(id => !ids.includes(String(id)));
                    if (!team.members.includes(team.leader_id)) team.leader_id = null;
                }
                eco.saveEventFinalizationDraft(event.id, draft);
            }
        }
        actor(req, removing ? 'RETIRAR_PARTICIPANTES_WEB' : 'AÑADIR_PARTICIPANTES_WEB', event, ids.join(', '));
        res.json({ success: true });
    }));
    app.post('/api/patrol/events/:id/registration', route(async (req, res) => {
        command(req, 'evento:convocar');
        const event = eventFor(req, true);
        if (event.status !== 'ACTIVE') fail(409, 'La operación ya está cerrada.');
        await exclusive(event.id, async () => {
            const channel = channelFor(req, event.registration_channel_id || event.target_channel_id);
            const payload = events.buildRegistrationPanel(event, eco.getEconomySettings(event.guild_id));
            const old = event.registration_message_id ? await channel.messages.fetch(event.registration_message_id).catch(() => null) : null;
            const message = old ? await old.edit(payload) : await channel.send(payload);
            eco.setEventPhase(event.id, 'REGISTRATION', { registration_channel_id: channel.id, registration_message_id: message.id });
            actor(req, 'PUBLICAR_CONVOCATORIA_WEB', event, `Canal ${channel.id}, mensaje ${message.id}`);
            res.json({ success: true, message_id: message.id });
        });
    }));
    app.put('/api/patrol/events/:id/report', route(async (req, res) => {
        command(req, 'evento:finalizar');
        const event = eventFor(req, true), body = req.body || {};
        if (locks.has(event.id)) fail(409, 'Hay una publicación en curso. Espera antes de modificar el borrador.');
        const draft = events.createEventFinalizationDraft(event, interaction(req, event), null, null, null, event.status === 'ENDED');
        for (const key of ['sector_ao', 'server_used', 'mission_rating', 'casualties_stats', 'co_host_id', 'mvp_id', 'result', 'notes']) {
            if (Object.hasOwn(body, key)) draft[key] = text(body[key], ['result', 'notes'].includes(key) ? 1500 : 180);
        }
        if (Object.hasOwn(body, 'evidence_url')) {
            const value = text(body.evidence_url, 2048);
            if (value && !/^https:\/\//i.test(value)) fail(400, 'La evidencia debe usar una URL HTTPS.');
            if (value) { try { const url = new URL(value); if (url.username || url.password) throw new Error(); } catch { fail(400, 'URL de evidencia inválida.'); } }
            draft.evidence = value ? { url: value, contentType: 'image/png' } : null;
        }
        if (body.team_key) {
            if (!events.EVENT_REPORT_TEAMS.some(team => team.key === body.team_key)) fail(400, 'Equipo inválido.');
            const ids = [...new Set(String(body.team_ids || '').match(/(?<!\d)\d{17,20}(?!\d)/g) || [])];
            if (String(body.team_ids || '').trim() && !ids.length) fail(400, 'No se encontraron IDs válidos para el equipo.');
            const roster = new Set(eco.getEventRegistrations(event.id).map(member => String(member.discord_id)));
            if (ids.some(id => !roster.has(id))) fail(400, 'Añade primero a todos los integrantes a la lista de participantes.');
            const selected = new Set(ids);
            for (const [key, team] of Object.entries(draft.teams || {})) {
                if (key === body.team_key) continue;
                team.members = (team.members || []).filter(id => !selected.has(String(id)));
                if (!team.members.includes(team.leader_id)) team.leader_id = null;
            }
            draft.teams ||= {};
            draft.teams[body.team_key] = { members: ids, leader_id: ids[0] || null };
            draft.active_team = body.team_key;
        }
        eco.saveEventFinalizationDraft(event.id, draft);
        actor(req, 'GUARDAR_AAR_WEB', event, 'Borrador y organización táctica actualizados');
        res.json({ success: true, report: draft });
    }));
    app.post('/api/patrol/events/:id/finalize', route(async (req, res) => {
        command(req, 'evento:finalizar');
        const event = eventFor(req, true);
        if (event.status !== 'ACTIVE') fail(409, 'El evento ya terminó. Usa Publicar reporte para editar el acta.');
        await exclusive(event.id, async () => {
            const context = interaction(req, event);
            if (!context.channel?.isTextBased()) fail(400, 'No hay un canal de texto disponible para publicar el cierre.');
            const draft = eco.getEventFinalizationDraft(event.id) || events.createEventFinalizationDraft(event, context, null, null, null, false);
            let template = {};
            try { template = JSON.parse(event.report_template_snapshot || '{}'); } catch {}
            if (template.evidence_required && !draft.evidence?.url) fail(400, 'La plantilla requiere una imagen de evidencia. Guarda su URL en el AAR.');
            draft.is_editing_report = false;
            eco.saveEventFinalizationDraft(event.id, draft);
            let notice;
            context.editReply = async payload => { notice = payload.content || payload.embeds?.[0]?.data?.title || ''; };
            await events.completeEventFinalization(context, event);
            const updated = eco.getEventById(event.id);
            if (updated.status !== 'ENDED') fail(400, notice || 'No se pudo finalizar la operación.');
            actor(req, 'FINALIZAR_PATRULLA_WEB', event, 'Cierre mediante el mismo flujo que Discord');
            res.json({ success: true, event: publicEvent(req.discordIdentity, updated), message: notice,
                warning: !updated.report_message_id ? 'El evento terminó; el reporte aún no se pudo publicar. Reintenta con Publicar reporte.' : null });
        });
    }));
    app.post('/api/patrol/events/:id/report/publish', route(async (req, res) => {
        command(req, 'evento:editar-reporte');
        const event = eventFor(req, true);
        if (event.status !== 'ENDED') fail(409, 'Finaliza primero la operación.');
        await exclusive(event.id, async () => {
            const draft = snapshot(event);
            let template = {};
            try { template = JSON.parse(event.report_template_snapshot || '{}'); } catch {}
            if (template.evidence_required && !draft.evidence?.url) fail(400, 'La plantilla exige una imagen de evidencia.');
            const result = await events.publishEventReport(interaction(req, event), event, {}, draft.evidence || null, draft.result || '', draft.notes || '', true);
            actor(req, 'PUBLICAR_AAR_WEB', event, 'Acta publicada o editada; sin nuevos pagos');
            res.json({ success: true, channel_id: result.channel?.id });
        });
    }));
}
module.exports = { installPatrolRoutes };
