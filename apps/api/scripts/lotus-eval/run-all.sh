#!/bin/bash
# Runs the whole E1 evaluation, three sessions at a time. Resumable: a finished run is skipped.
# Usage (from apps/api): bash scripts/lotus-eval/run-all.sh ../../lotus-test-records/eval-2026-11-07/runs
OUT="$1"
mkdir -p "$OUT/logs"
# Amendment 1: every condition asks the whole planned test.
export LOTUS_FULL_TEST=true
LEARNERS=$(grep -oE '\{ id: "E[0-9]+_[A-Z0-9_]+"' scripts/lotus-eval/learners.ts | sed -E 's/.*"(.*)"/\1/')
JOBS=""
for L in $LEARNERS; do
  for R in 1 2 3; do JOBS="$JOBS $L:LOTUS:$R"; done
  JOBS="$JOBS $L:FIXED:1 $L:AI_ONLY:1"
done
run_one() {
  IFS=: read -r L C R <<< "$1"
  OUT="$2"
  [ -f "$OUT/$L-$C-r$R.json" ] && { echo "skip $1"; return; }
  case "$C" in
    LOTUS) ENVS="env -u LOTUS_FIXED_PLAN -u LOTUS_AI_ONLY_ANALYSIS" ;;
    FIXED) ENVS="env -u LOTUS_AI_ONLY_ANALYSIS LOTUS_FIXED_PLAN=true" ;;
    AI_ONLY) ENVS="env -u LOTUS_FIXED_PLAN LOTUS_AI_ONLY_ANALYSIS=true" ;;
  esac
  $ENVS node --import tsx scripts/lotus-eval/run.ts "$L" "$C" "$R" "$OUT" > "$OUT/logs/$L-$C-r$R.log" 2>&1
  echo "$(date +%H:%M:%S) $1 $(grep -o 'EVAL_DONE.*' "$OUT/logs/$L-$C-r$R.log" | sed 's/.*answered/answered/' || echo FAILED)"
}
export -f run_one
echo $JOBS | tr ' ' '\n' | grep . | xargs -P 3 -I{} bash -c 'run_one "$@"' _ {} "$OUT"
echo ALL_DONE
