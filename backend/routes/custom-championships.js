const crypto = require('node:crypto');
const express = require('express');
const { pool, sendError } = require('../route-helpers');
const { ensureAuthSchema, getUserFromRequest, requireUser } = require('../auth');

const router = express.Router();
const fields = `c.id, c.user_id AS userId, u.display_name AS ownerName, c.name, c.description,
    c.visibility, c.configuration, c.created_at AS createdAt, c.updated_at AS updatedAt`;

function configuration(input = {}) {
    const identifiers = (value, limit) => Array.isArray(value)
        ? [...new Set(value.map(item => String(item).slice(0, 100)).filter(Boolean))].slice(0, limit) : [];
    const points = input.pointsSystem || {};
    const scale = value => Array.isArray(value) ? value.slice(0, 30).map(Number).filter(number => Number.isFinite(number) && number >= 0 && number <= 1000) : [];
    const raceIds = identifiers(input.raceIds, 100);
    if (!raceIds.length) throw new Error('Add at least one race.');
    return {
        raceIds,
        driverIds: identifiers(input.driverIds, 1000),
        constructorIds: identifiers(input.constructorIds, 500),
        pointsSystem: {
            id: String(points.id || 'modern').slice(0, 100), name: String(points.name || 'Modern').slice(0, 100),
            race: scale(points.race), sprint: scale(points.sprint), qualifying: scale(points.qualifying),
            poleBonus: Number(points.poleBonus || 0), fastestLapBonus: Number(points.fastestLapBonus || 0),
            fastestLapMaxPosition: points.fastestLapMaxPosition == null ? null : Number(points.fastestLapMaxPosition)
        }
    };
}
function serialize(row) { return { ...row, configuration: typeof row.configuration === 'string' ? JSON.parse(row.configuration) : row.configuration, owned: Boolean(row.owned) }; }
function payload(body) {
    const name = String(body.name || '').trim(), description = String(body.description || '').trim();
    if (name.length < 2 || name.length > 100) throw new Error('Championship name must be 2–100 characters.');
    if (description.length > 500) throw new Error('Description must be at most 500 characters.');
    return { name, description, visibility: body.visibility === 'public' ? 'public' : 'private', configuration: configuration(body.configuration) };
}

router.use('/api/custom-championships', (req, res, next) => { if (req.method === 'GET') return next(); const origin=req.get('origin'); if(origin&&origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Invalid request origin.'});next(); });
router.get('/api/custom-championships', requireUser, async (req,res)=>{try{await ensureAuthSchema();const rows=await pool.query(`SELECT ${fields}, c.user_id = ? AS owned FROM app_custom_championships c JOIN app_users u ON u.id=c.user_id WHERE c.visibility='public' OR c.user_id=? ORDER BY c.user_id = ? DESC, c.updated_at DESC`,[req.user.id,req.user.id,req.user.id]);res.json(rows.map(serialize));}catch(error){sendError(res,error);}});
router.get('/api/custom-championships/:id', async (req,res)=>{try{await ensureAuthSchema();const user=await getUserFromRequest(req),rows=await pool.query(`SELECT ${fields}, c.user_id = ? AS owned FROM app_custom_championships c JOIN app_users u ON u.id=c.user_id WHERE c.id=? AND (c.visibility='public' OR c.user_id=?)`,[user?.id||'',req.params.id,user?.id||'']);if(!rows.length)return res.status(404).json({error:'Championship not found.'});res.json(serialize(rows[0]));}catch(error){sendError(res,error);}});
router.post('/api/custom-championships',requireUser,async(req,res)=>{let data;try{data=payload(req.body);}catch(error){return res.status(400).json({error:error.message});}try{await ensureAuthSchema();const id=crypto.randomUUID();await pool.query('INSERT INTO app_custom_championships (id,user_id,name,description,visibility,configuration) VALUES (?,?,?,?,?,?)',[id,req.user.id,data.name,data.description,data.visibility,JSON.stringify(data.configuration)]);res.status(201).json({id,...data,owned:true});}catch(error){sendError(res,error);}});
router.put('/api/custom-championships/:id',requireUser,async(req,res)=>{let data;try{data=payload(req.body);}catch(error){return res.status(400).json({error:error.message});}try{const result=await pool.query('UPDATE app_custom_championships SET name=?,description=?,visibility=?,configuration=? WHERE id=? AND user_id=?',[data.name,data.description,data.visibility,JSON.stringify(data.configuration),req.params.id,req.user.id]);if(!result.affectedRows)return res.status(404).json({error:'Championship not found.'});res.json({id:req.params.id,...data,owned:true});}catch(error){sendError(res,error);}});
router.delete('/api/custom-championships/:id',requireUser,async(req,res)=>{try{const result=await pool.query('DELETE FROM app_custom_championships WHERE id=? AND user_id=?',[req.params.id,req.user.id]);if(!result.affectedRows)return res.status(404).json({error:'Championship not found.'});res.status(204).end();}catch(error){sendError(res,error);}});
module.exports=router;
