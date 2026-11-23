#!/usr/bin/env bash
# One-time VM setup for voyager.vazac.dev. Reads the sudo password from stdin.
# Usage: upload this script and the .nginx.conf to the deploy user's home with scp,
# then pipe only the sudo password into `bash setup-vhost.sh` over SSH.
set -euo pipefail
IFS= read -r PW
S() { printf '%s\n' "$PW" | sudo -S -p '' "$@"; }
FQDN=voyager.vazac.dev
OWNER="$(id -un)"
CONF="$HOME/voyager.vazac.dev.nginx.conf"

S mkdir -p /var/www/apps/$FQDN /var/cache/nginx/voyager-dsn
S chown "$OWNER:$OWNER" /var/www/apps/$FQDN
S chown nginx:nginx /var/cache/nginx/voyager-dsn 2>/dev/null || true
S restorecon -R /var/www/apps/$FQDN /var/cache/nginx/voyager-dsn 2>/dev/null || true

if [ ! -f /etc/letsencrypt/live/$FQDN/fullchain.pem ]; then
  # Port-80 only vhost first, so certbot can answer the HTTP challenge.
  printf 'server {\n listen 80;\n listen [::]:80;\n server_name %s;\n location /.well-known/acme-challenge/ { root /var/www/certbot; }\n location / { return 404; }\n}\n' "$FQDN" > /tmp/$FQDN.http
  S cp /tmp/$FQDN.http /etc/nginx/sites-available/$FQDN
  S ln -sf /etc/nginx/sites-available/$FQDN /etc/nginx/sites-enabled/$FQDN
  S nginx -t 2>&1 | grep -v "conflicting server name\|ignored" || true
  S systemctl reload nginx
  S certbot certonly --webroot -w /var/www/certbot -d $FQDN --non-interactive --agree-tos \
    --deploy-hook 'nginx -t && systemctl reload nginx'
fi

S cp "$CONF" /etc/nginx/sites-available/$FQDN
S ln -sf /etc/nginx/sites-available/$FQDN /etc/nginx/sites-enabled/$FQDN
S nginx -t
S systemctl reload nginx
rm -f "$CONF"
echo "vhost ready"
