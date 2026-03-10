# Debug Commands

Below is a list of commands for debugging

```bash
cd /opt
sudo chown user: .
git clone https://example.com

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash

exit

nvm -v

nvm ls-remote

nvm install 22.20.0

cd /opt/network-manager
./scripts/setup.sh

nano /home/user/.config/systemd/user/network-manager.service

systemctl --user daemon-reload
systemctl --user restart network-manager
systemctl --user status network-manager

journalctl --user -u network-manager.service
```
