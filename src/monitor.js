const { getDevices, parseDevice } = require('./genieacs');
const { sendMessage } = require('./wa');
const fs = require('fs');

const STATE_FILE = './device_state.json';

// Thresholds
const RX_WARNING_THRESHOLD = parseFloat(process.env.RX_WARNING_THRESHOLD || -27);
const TARGET_NUMBERS = (process.env.WA_TARGET_NUMBERS || '').split(',').map(n => n.trim());

// We store the last known state of devices mapped by ID
let deviceStates = {};
// We also cache the full latest parsed data for the web dashboard API
let latestDevicesData = [];

// Load previous state from disk to survive restarts
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf-8');
            deviceStates = JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load device state:', e.message);
    }
}

// Save current state to disk
function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(deviceStates, null, 2));
    } catch (e) {
        console.error('Failed to save device state:', e.message);
    }
}

// Ensure state is loaded
loadState();

function formatMessage(title, device, previousState) {
    let msg = `*--- ${title} ---*\n\n`;
    msg += `📍 *Location/Tag:* ${device.location}\n`;
    msg += `🆔 *Device ID:* ${device.id}\n`;
    msg += `🌐 *IP TR069:* ${device.ip}\n`;
    msg += `⏱️ *Uptime:* ${device.uptime}\n`;

    // Status
    const statusEmoji = device.isOnline ? '✅' : '🔴';
    msg += `🔌 *Status:* ${statusEmoji} ${device.isOnline ? 'ONLINE' : 'OFFLINE'}\n`;
    if (previousState && previousState.isOnline !== device.isOnline) {
        msg += `   _(was ${previousState.isOnline ? 'ONLINE' : 'OFFLINE'})_\n`;
    }

    // Optical Rx
    if (device.rxPower !== null && device.rxPower !== undefined) {
        const isBad = device.rxPower < RX_WARNING_THRESHOLD;
        const rxEmoji = isBad ? '⚠️' : '🟢';
        msg += `⚡ *Optical Rx:* ${rxEmoji} ${device.rxPower} dBm\n`;
    } else {
        msg += `⚡ *Optical Rx:* ❓ Unknown\n`;
    }

    msg += `\n🕒 ${new Date().toLocaleString('id-ID')}`;
    return msg;
}

async function runMonitor() {
    console.log('[Monitor] Starting polling cycle...');
    const rawDevices = await getDevices();
    if (!rawDevices || rawDevices.length === 0) {
        console.log('[Monitor] No devices fetched or error occurred.');
        return;
    }

    console.log(`[Monitor] Fetched ${rawDevices.length} devices from GenieACS. Processing...`);

    let alertsSent = 0;
    const currentParsedData = [];

    for (const rawDevice of rawDevices) {
        const device = parseDevice(rawDevice);
        currentParsedData.push(device);
        const previousState = deviceStates[device.id];

        let shouldAlert = false;
        let alertTitle = '';

        if (!previousState) {
            // First time seeing this device
            // Only alert if it's currently in a bad state (offline or low rx)
            if (!device.isOnline) {
                shouldAlert = true;
                alertTitle = 'ONT OFFLINE (New)';
            } else if (device.rxPower !== null && device.rxPower < RX_WARNING_THRESHOLD) {
                shouldAlert = true;
                alertTitle = 'LOW RX POWER (New)';
            }
        } else {
            // State Change Detection
            // 1. Status Changed
            if (previousState.isOnline && !device.isOnline) {
                shouldAlert = true;
                alertTitle = 'ONT WENT OFFLINE';
            } else if (!previousState.isOnline && device.isOnline) {
                shouldAlert = true;
                alertTitle = 'ONT BACK ONLINE';
            }
            // 2. Rx Power dropped below threshold
            else if (device.rxPower !== null) {
                const wasGood = previousState.rxPower >= RX_WARNING_THRESHOLD || previousState.rxPower === null;
                const isBad = device.rxPower < RX_WARNING_THRESHOLD;

                if (wasGood && isBad) {
                    shouldAlert = true;
                    alertTitle = 'CRITICAL RX POWER';
                }
            }
        }

        if (shouldAlert) {
            const messageText = formatMessage(alertTitle, device, previousState);
            console.log(`[Monitor] Alert triggered for ${device.id}: ${alertTitle}`);

            // Send to all target numbers
            for (const number of TARGET_NUMBERS) {
                if (number) {
                    await sendMessage(number, messageText);
                }
            }
            alertsSent++;
        }

        // Update state
        deviceStates[device.id] = {
            isOnline: device.isOnline,
            rxPower: device.rxPower,
            lastChecked: new Date().toISOString()
        };
    }

    // Update the dashboard cache
    latestDevicesData = currentParsedData;

    // Save states to disk
    saveState();
    console.log(`[Monitor] Polling cycle complete. Triggered ${alertsSent} alerts.`);
}

function getLatestData() {
    return latestDevicesData;
}

module.exports = {
    runMonitor,
    getLatestData
};
