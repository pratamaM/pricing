const express = require('express');
const { queryAll, queryGet } = require('../database/init');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

router.get('/top-destinations', (req, res) => {
    try {
        const land = queryAll(`SELECT destination_kota, SUM(total) as total_cost FROM master_biaya_land WHERE destination_kota IS NOT NULL AND destination_kota != '' GROUP BY destination_kota ORDER BY total_cost DESC LIMIT 10`);
        const sea = queryAll(`SELECT destination_kota, SUM(submit_value) as total_cost FROM master_biaya_sea WHERE destination_kota IS NOT NULL AND destination_kota != '' GROUP BY destination_kota ORDER BY total_cost DESC LIMIT 10`);
        res.json({ land, sea });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/summary', (req, res) => {
    try {
        const landCount = queryGet('SELECT COUNT(*) as c FROM master_biaya_land').c;
        const seaCount = queryGet('SELECT COUNT(*) as c FROM master_biaya_sea').c;
        const pendingCount = queryGet("SELECT COUNT(*) as c FROM fix_cost_requests WHERE status IN ('pending', 'approved_supervisor', 'approved_atasan')").c;
        
        res.json({ totalLandRoutes: landCount, totalSeaRoutes: seaCount, totalPendingApprovals: pendingCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
