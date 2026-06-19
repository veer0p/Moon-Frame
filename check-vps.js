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
        console.log(`Executing: ${cmd}`);
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

async function main() {
    const conn = await connect();
    try {
        console.log('--- Docker Check ---');
        const dockerVer = await execCommand(conn, 'docker --version');
        console.log('Docker:', dockerVer.stdout.trim() || 'Not found');

        console.log('--- Running Containers ---');
        const ps = await execCommand(conn, 'docker ps -a');
        console.log(ps.stdout);

        console.log('--- Nginx Status ---');
        const nginxStatus = await execCommand(conn, 'systemctl status nginx');
        console.log(nginxStatus.stdout.split('\n').slice(0, 5).join('\n'));

        console.log('--- Port 7880 check ---');
        const ports = await execCommand(conn, 'ss -tulpn | grep 7880 || true');
        console.log(ports.stdout);

    } catch (err) {
        console.error(err);
    } finally {
        conn.end();
    }
}

main();
