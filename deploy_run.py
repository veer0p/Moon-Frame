import pexpect
import sys

ip = "173.212.225.143"
user = "root"
password = "Veeridk1"
domain = "moonframe.viransi.in"

print("Uploading files via SCP...")
child = pexpect.spawn(f"bash -c 'scp -o StrictHostKeyChecking=no -r dist/* {user}@{ip}:/var/www/{domain}/'")
i = child.expect(['password:', 'Password:', pexpect.EOF, pexpect.TIMEOUT])
if i == 0 or i == 1:
    child.sendline(password)
    child.expect(pexpect.EOF, timeout=120)
    print(child.before.decode('utf-8', errors='ignore'))
    print("Deployment completed successfully.")
else:
    print("Failed to start SCP or no password prompt.")
    sys.exit(1)
