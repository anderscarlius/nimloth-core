#!/usr/bin/env bash
# Selective EHRbase wipe — stops ehrbase + ehrbase-db services in the
# nimloth-core compose project on CarliusFyra, removes the postgres volume,
# brings the two services back up and health-waits.
#
# Codified for SDG-10 AC5 (Del 1 AC4-lärdomar):
#   - Verify exact volume name BEFORE `volume rm` (race-proofing)
#   - Health-wait between up -d and template-load (oinitierat schema → race)
#   - Selective stop — leaves core-db, kafka, fhir-facade, composition-mapper,
#     openehr-composer untouched (they're peers in nimloth-core compose)
#   - Synology-ops gotchas: docker-compose (hyphen) at /usr/local/bin/,
#     docker binary not in PATH, set +e (no strict mode), no SCP
#
# Usage:  ./scripts/reset-ehrbase.sh
# Pre:    Local machine with SSH key for SkyttenAdmin@192.168.1.189.
# Post:   EHRbase up, schema-init complete, ZERO templates loaded.

set +e   # Synology shells choke on strict mode

NAS_HOST="${NAS_HOST:-SkyttenAdmin@192.168.1.189}"
DOCKER="/volume2/@appstore/ContainerManager/usr/bin/docker"
DOCKER_COMPOSE="/usr/local/bin/docker-compose"
PROJECT_DIR="/volume2/docker/nimloth-core"
VOLUME="nimloth-core_ehrbase-data"
APP="ehrbase"
DB="ehrbase-db"
EHRBASE_URL="${EHRBASE_URL:-http://192.168.1.189:11401/ehrbase}"
HEALTH_PATH="/rest/openehr/v1/definition/template/adl1.4"
HEALTH_DEADLINE_SECS=180

remote() {
  ssh -o StrictHostKeyChecking=accept-new "$NAS_HOST" "$@" 2>&1 \
    | grep -v 'WARNING.*post-quantum' \
    | grep -v 'may be vulnerable' \
    | grep -v 'server may need to be upgraded'
}

echo "=== SDG-10 EHRbase wipe ==="
echo "Target:        $NAS_HOST"
echo "Project dir:   $PROJECT_DIR"
echo "Volume:        $VOLUME"
echo "Services:      $APP, $DB"
echo "Health URL:    $EHRBASE_URL$HEALTH_PATH"
echo

# Step 1: verify volume name exists exactly — guard against rename drift
echo "[1/5] Verifying volume name..."
exact=$(remote "$DOCKER volume ls --format '{{.Name}}' | grep -x '$VOLUME'")
if [ -z "$exact" ]; then
  echo "  ERROR: volume '$VOLUME' not found. Inventory:"
  remote "$DOCKER volume ls --format '  - {{.Name}}' | grep ehrbase"
  exit 2
fi
echo "  OK — '$exact' present."

# Step 2: stop + remove the two service containers (NOT the project)
echo "[2/5] Stopping + removing $APP + $DB containers..."
remote "cd $PROJECT_DIR && $DOCKER_COMPOSE stop $APP $DB"
remote "cd $PROJECT_DIR && $DOCKER_COMPOSE rm -f $APP $DB"

# Step 3: remove the volume
echo "[3/5] Removing volume $VOLUME..."
rm_out=$(remote "$DOCKER volume rm $VOLUME")
if echo "$rm_out" | grep -q "volume is in use"; then
  echo "  ERROR: volume still in use. Probably another container mounts it. Aborting."
  echo "  Output: $rm_out"
  exit 3
fi
echo "  $rm_out"

# Step 4: bring back up — db first (schema init), then app
echo "[4/5] Starting $DB then $APP..."
remote "cd $PROJECT_DIR && $DOCKER_COMPOSE up -d $DB"
sleep 8   # initial postgres bootstrap so app doesn't race the schema
remote "cd $PROJECT_DIR && $DOCKER_COMPOSE up -d $APP"

# Step 5: health-wait — poll the templates endpoint, must return 200 + []
echo "[5/5] Health-waiting (deadline ${HEALTH_DEADLINE_SECS}s)..."
deadline=$(( $(date +%s) + HEALTH_DEADLINE_SECS ))
attempt=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  attempt=$((attempt + 1))
  body=$(curl -fsS --max-time 5 -H 'Accept: application/json' \
    "$EHRBASE_URL$HEALTH_PATH" 2>/dev/null)
  rc=$?
  if [ $rc -eq 0 ]; then
    echo "  OK after ${attempt} attempts. Templates loaded: $body"
    if [ "$body" != "[]" ]; then
      echo "  WARNING: expected empty template-list after wipe, got: $body"
    fi
    echo
    echo "=== Wipe complete. Next: pnpm openehr:load-templates + load-bridge-templates ==="
    exit 0
  fi
  sleep 3
done

echo "  ERROR: EHRbase did not respond within ${HEALTH_DEADLINE_SECS}s."
remote "$DOCKER logs --tail 60 ehrbase-core"
exit 4
