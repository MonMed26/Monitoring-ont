require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const { connectToWhatsApp } = require('./src/wa');
const { runMonitor, getLatestData } = require('./src/monitor');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse polling interval from ENV (default 5 mins)
const POLLING_INTERVAL = parseInt(process.env.POLL_INTERVAL_MINUTES) || 5;
const cronSchedule = `*/${POLLING_INTERVAL} * * * *`;

// --- Express Configuration ---
// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint to get the latest ONT data
app.get('/api/devices', (req, res) => {
    const data = getLatestData();
    res.json({
        success: true,
        count: data.length,
        data: data
    });
});

// --- Main Start Function ---
async function start() {
    console.log('-----------------------------------');
    console.log(' GenieACS ONT Monitor & WA Gateway ');
    console.log('-----------------------------------');

    // 1. Connect to WhatsApp API
    console.log('[App] Initializing WhatsApp connection...');
    await connectToWhatsApp();

    // 2. Start Cron Job
    console.log(`[App] Scheduling monitor to run every ${POLLING_INTERVAL} minutes (${cronSchedule})`);

    cron.schedule(cronSchedule, async () => {
        try {
            await runMonitor();
        } catch (error) {
            console.error('[App] Uncaught error during monitor execution:', error);
        }
    });

    // 3. Start Web Server
    app.listen(PORT, () => {
        console.log(`[Web] Dashboard running at http://localhost:${PORT}`);
    });

    // 4. Run initial check
    setTimeout(async () => {
        console.log('[App] Running initial check...');
        await runMonitor();
    }, 2000);
}

start();
