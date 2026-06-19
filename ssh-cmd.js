const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

// Simple helper to load .env manually (CommonJS)
function loadEnv() {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || '';
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
                process.env[key] = value.trim();
            }
        });
    }
}

loadEnv();

const conn = new Client();
conn.on('ready', () => {
    console.log('Connected');
    conn.exec('docker ps -a && docker logs --tail 50 livekit', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).on('error', (err) => {
    console.log('Error: ' + err);
}).connect({
    host: process.env.VPS_HOST || '173.212.225.143',
    port: parseInt(process.env.VPS_PORT || '22', 10),
    username: process.env.VPS_USERNAME || 'root',
    password: process.env.VPS_PASSWORD || '',
    readyTimeout: 10000
});
