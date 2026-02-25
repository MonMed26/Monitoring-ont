require('dotenv').config();
const axios = require('axios');

const GENIEACS_URL = process.env.GENIEACS_URL;
const [username, password] = (process.env.GENIEACS_AUTH || '').split(':');

const axiosInstance = axios.create({
    baseURL: GENIEACS_URL,
    auth: {
        username: username,
        password: password
    },
    timeout: 10000 // 10 second timeout
});

/**
 * Fetches all devices from GenieACS with the necessary fields for monitoring.
 * We query specific projection fields to reduce payload size.
 */
async function getDevices() {
    try {
        const projection = [
            '_id',                  // Device ID / SN (OUI-ProductClass-Serial)
            '_lastInform',          // For uptime/offline calculation
            '_tags',                // For location/tag
            'InternetGatewayDevice.DeviceInfo.ProductClass', // Try strict TR-069 path
            'DeviceID.ProductClass', // Try virtual/alias path
            'VirtualParameters.RXPower', // Virtual Parameter for Rx Power
            'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower', // FiberHome Optical Rx Power
            'InternetGatewayDevice.WANDevice.1.WANDSLInterfaceConfig.OpticalSignalLevel', // Generic Optical Rx Power
            'InternetGatewayDevice.WANDevice.1.WANDSLDiagnostics.RxPower', // Alternative Generic Optical Rx Power path
            'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress', // IP Address
            'InternetGatewayDevice.ManagementServer.ConnectionRequestURL', // TR069 URL containing IP
            'InternetGatewayDevice.DeviceInfo.UpTime' // Uptime in seconds
        ].join(',');

        // Using url encoding for projection
        const response = await axiosInstance.get(`/devices?projection=${encodeURIComponent(projection)}`);
        return response.data;
    } catch (error) {
        console.error('[GenieACS] Failed to fetch devices:', error.message);
        return [];
    }
}

/**
 * Parses raw device data into a standardized structure.
 */
function parseDevice(device) {
    // 1. Extract _id and ProductClass
    let id = device._id || 'Unknown';
    let productClass = '';

    // First try the explicit parameter from TR-069
    if (device.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value) {
        productClass = device.InternetGatewayDevice.DeviceInfo.ProductClass._value;
    } else if (device.DeviceID?.ProductClass?._value) {
        productClass = device.DeviceID.ProductClass._value;
    } else if (device._id && device._id.includes('-')) {
        // Fallback: Extract from _id which is formatted like <OUI>-<ProductClass>-<SerialNumber>
        const parts = device._id.split('-');
        if (parts.length >= 3) {
            productClass = parts[1]; // The ProductClass is the 2nd part
        }
    }

    if (productClass) {
        id = productClass; // User requested to use the Device Type / ProductClass here
    }

    // 2. Extract Tag / Location
    const tags = device._tags || [];
    const location = tags.length > 0 ? tags.join(', ') : 'No Tag';

    // 3. Status Check
    // If lastInform is older than e.g., 10 minutes, we might consider it offline
    // GenieACS itself doesn't have an explicit 'Online' boolean, it relies on Inform intervals.
    const lastInform = device._lastInform ? new Date(device._lastInform) : null;
    const now = new Date();
    const diffMs = lastInform ? (now - lastInform) : Infinity;
    const diffMinutes = Math.floor(diffMs / 60000);
    const isOnline = diffMinutes < 15; // Assume offline if no inform for 15 minutes

    // 4. Optical Rx Power
    // The path varies by vendor. We check a few common places.
    let rxPower = null;
    try {
        if (device.VirtualParameters?.RXPower?._value) {
            rxPower = device.VirtualParameters.RXPower._value;
        } else if (device.InternetGatewayDevice?.WANDevice?.['1']?.X_FH_GponInterfaceConfig?.RXPower?._value) {
            rxPower = device.InternetGatewayDevice.WANDevice['1'].X_FH_GponInterfaceConfig.RXPower._value;
        } else if (device.InternetGatewayDevice?.WANDevice?.['1']?.WANDSLInterfaceConfig?.OpticalSignalLevel?._value) {
            // Some ONTs report in 0.1 uW or other units, or direct dBm string.
            // Assuming the value contains dBm or is a number.
            rxPower = device.InternetGatewayDevice.WANDevice['1'].WANDSLInterfaceConfig.OpticalSignalLevel._value;
        } else if (device.InternetGatewayDevice?.WANDevice?.['1']?.WANDSLDiagnostics?.RxPower?._value) {
            rxPower = device.InternetGatewayDevice.WANDevice['1'].WANDSLDiagnostics.RxPower._value;
        }

        // Let's coerce to a number if it is a numeric string like "-24.5"
        if (rxPower !== null) {
            let num = parseFloat(rxPower);
            if (!isNaN(num)) rxPower = num;
        }
    } catch (e) {
        // Silently ignore if path missing
    }

    // 5. Uptime
    let uptimeSeconds = 0;
    try {
        if (device.InternetGatewayDevice?.DeviceInfo?.UpTime?._value) {
            uptimeSeconds = parseInt(device.InternetGatewayDevice.DeviceInfo.UpTime._value) || 0;
        }
    } catch (e) { }

    // Format Uptime (e.g., "1d 2h 30m")
    const d = Math.floor(uptimeSeconds / (3600 * 24));
    const h = Math.floor(uptimeSeconds % (3600 * 24) / 3600);
    const m = Math.floor(uptimeSeconds % 3600 / 60);
    const formattedUptime = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;

    // 6. IP TR069
    let ip = 'Unknown';
    try {
        if (device.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANIPConnection?.['1']?.ExternalIPAddress?._value) {
            ip = device.InternetGatewayDevice.WANDevice['1'].WANConnectionDevice['1'].WANIPConnection['1'].ExternalIPAddress._value;
        } else if (device.InternetGatewayDevice?.ManagementServer?.ConnectionRequestURL?._value) {
            // e.g. http://10.10.10.2:7547/tr069
            const url = device.InternetGatewayDevice.ManagementServer.ConnectionRequestURL._value;
            const match = url.match(/https?:\/\/([^:]+)/);
            if (match && match[1]) {
                ip = match[1];
            }
        }
    } catch (e) { }

    return {
        id,
        location,
        isOnline,
        lastInform,
        rxPower,
        uptime: formattedUptime,
        ip
    };
}

module.exports = {
    getDevices,
    parseDevice
};
