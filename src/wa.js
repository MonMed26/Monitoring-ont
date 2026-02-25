const axios = require('axios');

async function connectToWhatsApp() {
    // No initialization needed for the HTTP API
    console.log('[WA] Using WACLOUD API Gateway, ready to send messages.');
}

/**
 * Sends a WhatsApp message to a specific number using WACLOUD API.
 * @param {string} to - The target phone number (e.g., '628123456789')
 * @param {string} text - The message text
 */
async function sendMessage(to, text) {
    const apiKey = process.env.WA_API_KEY;

    if (!apiKey) {
        console.error('[WA] Cannot send message: WA_API_KEY is not defined in .env');
        return;
    }

    try {
        const payload = {
            "api_key": apiKey,
            "receiver": to,
            "data": {
                "message": text
            }
        };

        const response = await axios.post('https://app.wacloud.web.id/api/send-message', payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data && response.data.status) {
            console.log(`[WA] Successfully sent message to ${to}`);
        } else {
            console.error(`[WA] API Error when sending to ${to}:`, response.data);
        }
    } catch (error) {
        console.error(`[WA] Failed to send message to ${to}:`, error?.response?.data || error.message);
    }
}

module.exports = {
    connectToWhatsApp,
    sendMessage
};
