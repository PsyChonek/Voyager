#!/usr/bin/env bash
# Publish dist/ to the web server over rsync+SSH, then verify key URLs.
# Required env: DEPLOY_TARGET (user@host). Optional: DEPLOY_SSH_KEY, SITE_FQDN, DEPLOY_ROOT.
set -euo pipefail
cd "$(dirname "$0")/.."
SITE_FQDN="${SITE_FQDN:-voyager.vazac.dev}"
DEPLOY_TARGET="${DEPLOY_TARGET:?Set DEPLOY_TARGET=user@host}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/apps/$SITE_FQDN}"
SSH_OPTS="-o BatchMode=yes${DEPLOY_SSH_KEY:+ -i $DEPLOY_SSH_KEY}"

[ -f dist/index.html ] || { echo "dist/ missing, run pnpm build first" >&2; exit 1; }

rsync -az --delete -e "ssh $SSH_OPTS" dist/ "$DEPLOY_TARGET:$DEPLOY_ROOT/"

echo "Verifying:"
fail=0
for path in '' en/ prozkoumat/ en/explore/ data/ en/data/ health data/live.json data/ephemeris.json \
  data/science.json models/voyager.glb textures/sun.webp sitemap-index.xml robots.txt api/dsn.xml; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$SITE_FQDN/$path")"
  echo "$code https://$SITE_FQDN/$path"
  [ "$code" = 200 ] || fail=1
done
exit "$fail"
