#!/bin/sh
# The production scheduler (docker-compose.prod.yml "scheduler"): calls the API's worker-only job routes.
# API_URL defaults to the compose service name.
API_URL="${API_URL:-http://api:3001}"

if [ -z "$COGNA_JOB_WORKER_TOKEN" ]; then
  echo "COGNA_JOB_WORKER_TOKEN is not set, so scheduled jobs can't run. Set it in .env.production."
  exit 1
fi

run() {
  curl -fsS -m 300 -X POST -H "Authorization: Bearer $COGNA_JOB_WORKER_TOKEN" "$API_URL$1" > /dev/null \
    || echo "$(date -u +%FT%TZ) job $1 failed"
}

sleep 60
minute=0
while true; do
  run /lotus/jobs/run-outbox
  [ $((minute % 10)) -eq 0 ] && run /jobs/email-deliveries/retry
  if [ $((minute % 1440)) -eq 0 ]; then
    run /jobs/daily-revision-plans/run
    run /jobs/item-statistics/refresh
  fi
  [ $((minute % 10080)) -eq 0 ] && run /jobs/weekly-reports/run
  minute=$((minute + 1))
  sleep 60
done
