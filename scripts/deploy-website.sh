#!/usr/bin/env bash
# Publish dist/ to https://voyager.vazac.dev/ on the Oracle VM.
# nginx vhost: deploy/voyager.vazac.dev.nginx.conf, web root /var/www/apps/voyager.vazac.dev/.
# Uses the existing Oracle SSH identity; override with WEBSITE_SSH_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."
SITE_FQDN="voyager.vazac.dev"
SSH_KEY="${WEBSITE_SSH_KEY:-$HOME/.ssh/id_ed25519}"

[ -f dist/index.html ] || { echo "dist/ missing, run pnpm build first" >&2; exit 1; }

rsync -az --delete \
  -e "ssh -i $SSH_KEY -o BatchMode=yes" \
  dist/ "user@host:/var/www/apps/$SITE_FQDN/"

echo "Verifying:"
fail=0
for path in '' en/ prozkoumat/ en/explore/ data/ en/data/ health data/live.json data/ephemeris.json \
  data/science.json models/voyager.glb sitemap-index.xml robots.txt api/dsn.xml; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$SITE_FQDN/$path")"
  echo "$code https://$SITE_FQDN/$path"
  [ "$code" = 200 ] || fail=1
done
exit "$fail"
