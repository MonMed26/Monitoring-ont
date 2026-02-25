# GenieACS ONT Monitoring & WhatsApp Gateway

A Node.js application to monitor ONT devices managed by GenieACS. It periodically checks the devices for their Online/Offline status and their Optical Rx Power. If an anomaly is detected, it sends an alert to specified WhatsApp numbers using the `@whiskeysockets/baileys` library.

## Prerequisites
- Node.js (v18 or higher recommended)
- A running GenieACS instance

## Setup

1. **Configure Environment Variables**
   Edit the `.env` file in the root directory and update the following values:
   - `GENIEACS_URL`: URL to your GenieACS API (e.g. `http://192.168.20.197:7557`)
   - `GENIEACS_AUTH`: Username and password for GenieACS (`admin:50223044`)
   - `WA_TARGET_NUMBERS`: Comma-separated list of WhatsApp numbers to send alerts to (include country code, e.g., `628123456789`).
   - `POLL_INTERVAL_MINUTES`: How often to check for updates (default is 5).
   - `RX_WARNING_THRESHOLD`: The minimum acceptable Rx Power in dBm (default is -27). Alerts trigger if it drops below this.

2. **Run the Application**
   ```bash
   node index.js
   ```

3. **Link WhatsApp**
   When you run the script for the first time, a QR code will be generated in your terminal.
   Open WhatsApp on your phone -> Linked Devices -> Link a Device, and scan the QR code.
   Once linked, the session is saved in the `auth_info_baileys` folder so you don't need to scan it again on restart.

## How it Works
- The app fetches all devices from `/devices` with a projection query to save bandwidth.
- It calculates `isOnline` by checking if `_lastInform` is within the last 15 minutes.
- It parses various vendor-specific TR-069 paths to find Rx Power and external IP Address.
- It maintains a `device_state.json` file to remember the last state of the ONTs. Alerts are only sent when a state *changes* (e.g., Goes from Online to Offline).
