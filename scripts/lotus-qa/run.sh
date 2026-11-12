#!/usr/bin/env bash
# Real-browser Lotus QA. Usage: scripts/lotus-qa/run.sh <label> <fake|live> <normal|fast|normal,fast> <persona,ids|ALL|SCENARIOS>
# Uses only the disposable qualification database. Prints no secrets.
set -u
cd "$(dirname "$0")/../.."
label="$1"; mode="$2"; paces="$3"; who="$4"
set -a; source .env; set +a
# A one-off key can be supplied for a run without being saved anywhere.
[ -n "${LOTUS_QA_API_KEY:-}" ] && export OPENAI_API_KEY="$LOTUS_QA_API_KEY"
base="${DATABASE_URL%%\?*}"; query=""; [[ "$DATABASE_URL" == *\?* ]] && query="?${DATABASE_URL#*\?}"
export LOTUS_AUTONOMOUS_EVAL_DATABASE_URL="${base%/*}/cogna_lotus_qualification${query}"
export LOTUS_AUTONOMOUS_EVAL_REQUIRE_ISOLATED_DATABASE=true
export LOTUS_AUTONOMOUS_EVAL_MODEL_MODE="$mode" LOTUS_AUTONOMOUS_EVAL_PACES="$paces" LOTUS_AUTONOMOUS_EVAL_RUNS=1
export LOTUS_AUTONOMOUS_EVAL_WEB_PORT=3900 LOTUS_AUTONOMOUS_EVAL_API_PORT=3901
export LOTUS_AUTONOMOUS_EVAL_ARTIFACT_DIR="test-results/lotus-qa/$label"
export LOTUS_AUTONOMOUS_EVAL_REPORT_PATH="test-results/lotus-qa/$label/report.json"
export LOTUS_AUTONOMOUS_EVAL_DEBUG_LOG_PATH="test-results/lotus-qa/$label/server"
unset LOTUS_AUTONOMOUS_EVAL_SUBMIT
mkdir -p "$LOTUS_AUTONOMOUS_EVAL_ARTIFACT_DIR"
ALL=P01_SECURE_ADVANCED,P02_NUMERIC_HCF_ONLY,P03_VARIABLE_COMMON_FACTOR_GAP,P04_DIVIDE_FIRST_TERM_ONLY,P05_NEGATIVE_SIGN_ERROR,P06_DIFF_SQUARES_MISCONCEPTION,P07_GROUPING_MISCONCEPTION,P08_EXPLICIT_SUPPORT_NEED,P09_ONE_OFF_SLIP,P10_LOW_CONFIDENCE_CORRECT,X01_CARELESS_COPIER,X02_GUESSER_WHEN_HARD,X03_REAL_GAP_PLUS_SLIPS,X04_SCRUFFY_TYPIST,X05_CANCELLING_ERRORS,X06_SIGNS_EVERYWHERE,X07_TIRED_HALFWAY,X08_RANDOM_TAPPER,X09_DIFFERENT_METHOD
if [ "$who" = SCENARIOS ]; then export LOTUS_QA_SCENARIOS=true LOTUS_AUTONOMOUS_EVAL_PERSONAS=P01_SECURE_ADVANCED
elif [ "$who" = ALL ]; then export LOTUS_AUTONOMOUS_EVAL_PERSONAS="$ALL"
else export LOTUS_AUTONOMOUS_EVAL_PERSONAS="$who"; fi
node --import tsx scripts/lotus-autonomous-persona-eval.ts 2>&1 | grep -E "\[(plan|result|scenario|scorecard)\]|^Error|Playwright"
