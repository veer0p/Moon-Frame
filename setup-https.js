import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple helper to load .env manually
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

const config = {
    host: process.env.VPS_HOST || '173.212.225.143',
    port: parseInt(process.env.VPS_PORT || '22', 10),
    username: process.env.VPS_USERNAME || 'root',
    password: process.env.VPS_PASSWORD || ''
};

const domain = 'moonframe.viransi.in';

function connect() {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => resolve(conn))
            .on('error', reject)
            .connect(config);
    });
}

function execCommand(conn, cmd) {
    return new Promise((resolve, reject) => {
        console.log(`Executing remote command: ${cmd}`);
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let stdout = '';
            let stderr = '';
            stream.on('close', (code, signal) => {
                resolve({ code, stdout, stderr });
            }).on('data', (data) => {
                stdout += data.toString();
            }).stderr.on('data', (data) => {
                stderr += data.toString();
            });
        });
    });
}

async function setup() {
    console.log('Connecting to VPS...');
    const conn = await connect();
    console.log('Connected!');

    try {
        // Check OS
        const osInfo = await execCommand(conn, 'cat /etc/os-release');
        console.log('OS Info:', osInfo.stdout);

        // Update package list and install certbot + nginx plugin
        console.log('Installing certbot...');
        const installResult = await execCommand(conn, 'apt-get update && apt-get install -y certbot python3-certbot-nginx');
        console.log('Install certbot output:', installResult.stdout, installResult.stderr);

        // Request SSL cert
        console.log('Requesting SSL certificate from Let\'s Encrypt...');
        const certResult = await execCommand(conn, `certbot --nginx -d ${domain} --non-interactive --agree-tos --register-unsafely-without-email --redirect`);
        console.log('Certbot output:', certResult.stdout, certResult.stderr);

        // Verify Nginx reload
        const reloadResult = await execCommand(conn, 'systemctl reload nginx || service nginx reload');
        console.log('Nginx reload output:', reloadResult.stdout, reloadResult.stderr);

        console.log('\nHTTPS setup completed successfully!');
    } catch (error) {
        console.error('HTTPS setup failed:', error);
    } finally {
        conn.end();
    }
}

setup();
