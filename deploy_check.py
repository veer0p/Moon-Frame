import pexpect
import sys
import re

ip = "173.212.225.143"
user = "root"
password = "Veeridk1"
domain = "moonframe.viransi.in"

# Start SSH session
print("Connecting to server...")
child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}")

# Expect password prompt
i = child.expect(['password:', 'Password:', pexpect.EOF, pexpect.TIMEOUT])
if i == 0 or i == 1:
    child.sendline(password)
else:
    print("Failed to connect or no password prompt.")
    sys.exit(1)

# Wait for shell prompt
child.expect(['# ', '\$ '])

# Find nginx config for domain
child.sendline(f"grep -R 'server_name.*{domain}' /etc/nginx/sites-available/ /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ || echo 'NOT_FOUND'")
child.expect(['# ', '\$ '])
output = child.before.decode('utf-8')

if "NOT_FOUND" in output and "server_name" not in output:
    print("Domain not found in Nginx config. Let's look for standard directories.")
    child.sendline(f"ls -d /var/www/{domain}* || echo 'NO_DIR'")
    child.expect(['# ', '\$ '])
    ls_out = child.before.decode('utf-8')
    if "NO_DIR" not in ls_out:
        print(f"Found directory: {ls_out}")
    else:
        print("Could not find standard directory either.")
        child.sendline("cat /etc/nginx/sites-available/moonframe.viransi.in || echo 'NO_FILE'")
        child.expect(['# ', '\$ '])
        print(child.before.decode('utf-8'))
else:
    print(f"Found Nginx config for domain:\n{output}")
    # Extract config file path
    lines = output.split('\n')
    for line in lines:
        if "server_name" in line and domain in line:
            conf_file = line.split(':')[0]
            if conf_file:
                child.sendline(f"cat {conf_file}")
                child.expect(['# ', '\$ '])
                print(f"Content of {conf_file}:\n{child.before.decode('utf-8')}")
                break

child.sendline("exit")
child.expect(pexpect.EOF)
