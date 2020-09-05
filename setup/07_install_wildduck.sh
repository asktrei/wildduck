#! /bin/bash

OURNAME=06_install_wildduck.sh

echo -e "\n-- Executing ${ORANGE}${OURNAME}${NC} subscript --"

####### WILD DUCK #######

# clear previous install
if [ -f "/etc/systemd/system/gmi-mail.service" ]
then
    $SYSTEMCTL_PATH stop gmi-mail || true
    $SYSTEMCTL_PATH disable gmi-mail || true
    rm -rf /etc/systemd/system/gmi-mail.service
fi
rm -rf /var/opt/wildduck.git
rm -rf /opt/gmi-mail
rm -rf /etc/gmi-mail

# fresh install
cd /var/opt
git clone --bare git://github.com/nodemailer/wildduck.git

# create update hook so we can later deploy to this location
hook_script wildduck

# allow deploy user to restart wildduck service
echo "deploy ALL = (root) NOPASSWD: $SYSTEMCTL_PATH restart gmi-mail" >> /etc/sudoers.d/gmi-mail

# checkout files from git to working directory
mkdir -p /opt/gmi-mail
git --git-dir=/var/opt/wildduck.git --work-tree=/opt/gmi-mail checkout "$WILDDUCK_COMMIT"
cp -r /opt/gmi-mail/config /etc/gmi-mail
mv /etc/gmi-mail/default.toml /etc/gmi-mail/gmi-mail.toml

# enable example message
sed -i -e 's/"disabled": true/"disabled": false/g' /opt/gmi-mail/emails/00-example.json

# update ports
sed -i -e "s/999/99/g;s/localhost/$HOSTNAME/g" /etc/gmi-mail/imap.toml
sed -i -e "s/999/99/g;s/localhost/$HOSTNAME/g" /etc/gmi-mail/pop3.toml

echo "enabled=true
port=24
disableSTARTTLS=true" > /etc/gmi-mail/lmtp.toml

# make sure that DKIM keys are not stored to database as cleartext
#echo "secret=\"$DKIM_SECRET\"
#cipher=\"aes192\"" >> /etc/gmi-mail/dkim.toml

echo "user=\"gmi-mail\"
group=\"gmi-mail\"
emailDomain=\"$MAILDOMAIN\"" | cat - /etc/gmi-mail/gmi-mail.toml > temp && mv temp /etc/gmi-mail/gmi-mail.toml

sed -i -e "s/localhost:3000/$HOSTNAME/g;s/localhost/$HOSTNAME/g;s/2587/587/g" /etc/gmi-mail/gmi-mail.toml

cd /opt/gmi-mail
npm install --unsafe-perm --production

chown -R deploy:deploy /var/opt/wildduck.git
chown -R deploy:deploy /opt/gmi-mail

echo "d /opt/gmi-mail 0755 deploy deploy
d /etc/gmi-mail 0755 gmi-mail gmi-mail" > /etc/tmpfiles.d/zone-mta.conf
log_script "gmi-mail-server"

echo "[Unit]
Description=GMI Mail Server
Conflicts=cyrus.service dovecot.service
After=mongod.service redis.service

[Service]
Environment=\"NODE_ENV=production\"
WorkingDirectory=/opt/gmi-mail
ExecStart=$NODE_PATH server.js --config=\"/etc/gmi-mail/gmi-mail.toml\"
ExecReload=/bin/kill -HUP \$MAINPID
Type=simple
Restart=always
SyslogIdentifier=gmi-mail-server

[Install]
WantedBy=multi-user.target" > /etc/systemd/system/gmi-mail.service

$SYSTEMCTL_PATH enable gmi-mail.service
