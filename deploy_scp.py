import pexpect
import sys
import os

ip = "173.212.225.143"
user = "root"
password = "Veeridk1"
local_dir = "dist/*"
remote_dir = "/var/www/moonframe.viransi.in/"

# Run SCP via bash to expand wildcard
print("Deploying files via SCP...")
cmd = f"scp -o StrictHostKeyChecking=no -r dist/* {user}@{ip}:{remote_dir}"
child = pexpect.spawn('/bin/bash', ['-c', cmd], timeout=300)

i = child.expect(['password:', 'Password:', pexpect.EOF, pexpect.TIMEOUT])
if i == 0 or i == 1:
    child.sendline(password)
    child.expect(pexpect.EOF)
    print("Deployment completed!")
    print(child.before.decode('utf-8'))
else:
    print("Deployment failed.")
    print(child.before.decode('utf-8'))
    sys.exit(1)
