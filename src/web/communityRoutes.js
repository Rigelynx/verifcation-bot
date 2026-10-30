const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../database/db');
const community = require('../database/communityDb');
function installCommunityRoutes(app, auth) {
    const mediaRoot = path.join(path.dirname(db.dbPath), 'guilds');
    app.use('/guild-media', express.static(mediaRoot, { dotfiles: 'deny', fallthrough: false }));
    app.get('/api/community/profile', auth.requireAccess('member'), (req, res) => {
        res.json({ success: true, profile: community.publicProfile(community.ensureCommunity(req.guildId, req.discordIdentity.guild.name)) });
    });
    app.put('/api/admin/branding', auth.requireAccess('admin'), (req, res) => {
        try {
            const profile = community.updateBranding(req.guildId, req.body);
            db.addAdminAuditLog(req.adminOperator, 'EDITAR_IDENTIDAD', req.guildId, `Identidad: ${profile.display_name}; tema=${profile.theme}`);
            res.json({ success: true, profile: community.publicProfile(profile) });
        } catch (error) { res.status(400).json({ success: false, message: error.message }); }
    });
    app.post('/api/admin/branding/image', express.json({ limit: '3mb' }), auth.requireAccess('admin'), (req, res) => {
        try {
            if (!['logo', 'banner'].includes(req.body.kind)) throw new Error('Tipo de imagen inválido.');
            const content = req.body.content;
            if (typeof content !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(content) || content.length > 2800000) throw new Error('La imagen debe pesar menos de 2 MB.');
            const bytes = Buffer.from(content, 'base64');
            let extension;
            if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = 'png';
            else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg';
            else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
            if (!extension || bytes.length > 2 * 1024 * 1024) throw new Error('Solo se admiten imágenes PNG, JPG o WebP de hasta 2 MB.');
            const directory = path.join(mediaRoot, req.guildId, 'branding');
            fs.mkdirSync(directory, { recursive: true });
            const filename = crypto.createHash('sha256').update(bytes).digest('hex') + '.' + extension;
            fs.writeFileSync(path.join(directory, filename), bytes, { flag: 'w' });
            db.addAdminAuditLog(req.adminOperator, 'SUBIR_IMAGEN', req.guildId, `Imagen ${req.body.kind}: ${filename}`);
            res.json({ success: true, url: `/guild-media/${req.guildId}/branding/${filename}` });
        } catch (error) { res.status(400).json({ success: false, message: error.message }); }
    });
}
module.exports = { installCommunityRoutes };
