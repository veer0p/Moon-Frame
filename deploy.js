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
const remoteDir = `/var/www/${domain}`;

// Helper to recursively get files
function getFiles(dir) {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const files = dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    });
    return files.flat();
}

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

function sftpUpload(conn, localFile, remoteFile) {
    return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
            if (err) return reject(err);
            
            // Ensure remote directory exists
            const remoteParentDir = path.dirname(remoteFile).replace(/\\/g, '/');
            
            // Execute remote command to mkdir -p before uploading
            execCommand(conn, `mkdir -p "${remoteParentDir}"`).then(() => {
                console.log(`Uploading: ${localFile} -> ${remoteFile}`);
                sftp.fastPut(localFile, remoteFile, (uploadErr) => {
                    if (uploadErr) reject(uploadErr);
                    else resolve();
                });
            }).catch(reject);
        });
    });
}

async function deploy() {
    console.log('Connecting to VPS...');
    const conn = await connect();
    console.log('Connected!');

    try {
        // 1. Create remote web directory and make sure permissions are set
        console.log('Preparing remote directories...');
        await execCommand(conn, `mkdir -p ${remoteDir}`);

        // 2. Upload built files
        const localDistDir = path.join(__dirname, 'dist');
        const localFiles = getFiles(localDistDir);

        for (const file of localFiles) {
            const relativePath = path.relative(localDistDir, file);
            const remoteFilePath = path.join(remoteDir, relativePath).replace(/\\/g, '/');
            await sftpUpload(conn, file, remoteFilePath);
        }
        console.log('All files uploaded successfully.');

        // 3. Detect Nginx and write configuration
        console.log('Configuring Nginx...');
        const remoteConfPath = `/etc/nginx/conf.d/${domain}.conf`;

        // Check if remote configuration already has SSL configured to avoid overwriting it
        const checkSslConfig = await execCommand(conn, `[ -f ${remoteConfPath} ] && (grep -q "listen 443" ${remoteConfPath} || grep -q "ssl_certificate" ${remoteConfPath})`);
        
        if (checkSslConfig.code === 0) {
            console.log('Nginx configuration already contains SSL setup. Skipping overwrite to preserve HTTPS.');
        } else {
            // Define Nginx server block configuration
            const nginxConfig = `
server {
    listen 80;
    server_name ${domain};

    root ${remoteDir};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    error_log  /var/log/nginx/${domain}_error.log;
    access_log /var/log/nginx/${domain}_access.log;
}
`;
            
            // Write config file on remote server
            const tempLocalConf = path.join(__dirname, 'nginx.conf');
            fs.writeFileSync(tempLocalConf, nginxConfig);

            await sftpUpload(conn, tempLocalConf, `/tmp/${domain}.conf`);
            fs.unlinkSync(tempLocalConf);

            // Move configuration to Nginx folder and create a symlink if sites-enabled is used
            await execCommand(conn, `mv /tmp/${domain}.conf ${remoteConfPath}`);
        }


        // Let's check if Nginx is installed, reload it
        const checkNginx = await execCommand(conn, 'nginx -t');
        if (checkNginx.code === 0) {
            console.log('Nginx config test passed, reloading Nginx...');
            await execCommand(conn, 'systemctl reload nginx || service nginx reload');
            console.log('Nginx reloaded successfully.');
        } else {
            console.error('Nginx test failed:');
            console.error(checkNginx.stderr);
            console.log('Attempting to install Nginx since it may not be present...');
            await execCommand(conn, 'apt-get update && apt-get install -y nginx');
            await execCommand(conn, `mv ${remoteConfPath} /etc/nginx/sites-available/${domain} || true`);
            await execCommand(conn, `ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/ || true`);
            await execCommand(conn, 'systemctl restart nginx || service nginx restart');
            console.log('Nginx installed and started.');
        }

        // --- LiveKit Deployment ---
        console.log('\n--- Starting LiveKit Server Deployment ---');
        
        // 1. Write LiveKit YAML config
        const lkApiKey = process.env.LIVEKIT_API_KEY || 'moonframe_livekit_api';
        const lkApiSecret = process.env.LIVEKIT_API_SECRET || 'moonframe_livekit_secret_Veer_2026';
        
        const livekitYaml = `port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50200
  use_external_ip: true
keys:
  ${lkApiKey}: ${lkApiSecret}
`;
        
        const tempLocalYaml = path.join(__dirname, 'livekit.yaml');
        fs.writeFileSync(tempLocalYaml, livekitYaml);
        await sftpUpload(conn, tempLocalYaml, '/tmp/livekit.yaml');
        fs.unlinkSync(tempLocalYaml);
        
        await execCommand(conn, 'mkdir -p /etc && mv /tmp/livekit.yaml /etc/livekit.yaml');
        
        // 2. Start LiveKit in Docker
        console.log('Starting LiveKit server Docker container...');
        await execCommand(conn, 'docker stop livekit || true');
        await execCommand(conn, 'docker rm livekit || true');
        await execCommand(conn, 'docker run -d --name livekit --restart=always -p 7880:7880 -p 7881:7881 -p 50000-50200:50000-50200/udp -v /etc/livekit.yaml:/etc/livekit.yaml livekit/livekit-server --config /etc/livekit.yaml');
        
        // 3. Configure Nginx reverse proxy for LiveKit subdomain
        console.log('Configuring Nginx reverse proxy for LiveKit subdomain...');
        const lkDomain = 'livekit.viransi.in';
        const lkNginxConfig = `server {
    listen 80;
    server_name ${lkDomain};

    location / {
        proxy_pass http://localhost:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
        const tempLocalLkConf = path.join(__dirname, 'livekit-nginx.conf');
        fs.writeFileSync(tempLocalLkConf, lkNginxConfig);
        await sftpUpload(conn, tempLocalLkConf, `/tmp/${lkDomain}.conf`);
        fs.unlinkSync(tempLocalLkConf);
        
        const lkRemoteConfPath = `/etc/nginx/conf.d/${lkDomain}.conf`;
        const moveLkConf = await execCommand(conn, `mv /tmp/${lkDomain}.conf ${lkRemoteConfPath} || mv /tmp/${lkDomain}.conf /etc/nginx/sites-available/${lkDomain}`);
        
        // Link config if we used sites-available/sites-enabled fallback
        if (moveLkConf.code === 0) {
            await execCommand(conn, `[ -f /etc/nginx/sites-available/${lkDomain} ] && ln -sf /etc/nginx/sites-available/${lkDomain} /etc/nginx/sites-enabled/${lkDomain} || true`);
        }


        // 4. Reload Nginx and execute Certbot for SSL certificate
        const testLkNginx = await execCommand(conn, 'nginx -t');
        if (testLkNginx.code === 0) {
            console.log('Nginx config test passed, reloading Nginx...');
            await execCommand(conn, 'systemctl reload nginx || service nginx reload');
            
            console.log('Requesting SSL certificate for LiveKit subdomain via Certbot...');
            await execCommand(conn, 'apt-get update && apt-get install -y certbot python3-certbot-nginx || true');
            const certResult = await execCommand(conn, `certbot --nginx -d ${lkDomain} --non-interactive --agree-tos --register-unsafely-without-email --redirect`);
            console.log('Certbot LiveKit output:', certResult.stdout, certResult.stderr);
            
            // Reload Nginx one more time
            await execCommand(conn, 'systemctl reload nginx || service nginx reload');
            console.log('LiveKit SSL proxy setup completed successfully.');
        } else {
            console.error('Nginx config test failed:');
            console.error(testLkNginx.stderr);
        }

        console.log(`\nDeployment completed successfully!`);
        console.log(`Frontend: https://${domain}`);
        console.log(`LiveKit Server: https://${lkDomain}`);

    } catch (error) {
        console.error('Deployment failed:', error);
    } finally {
        conn.end();
    }
}

deploy();
