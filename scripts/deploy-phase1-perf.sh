#!/bin/bash
# Phase 1 Performance Optimization Deployment Script
# Run this script when you have database access to apply the migration

set -e

echo "========================================="
echo "Phase 1 Performance Optimization Deployment"
echo "========================================="
echo ""

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo ""
  echo "Please set DATABASE_URL to your PostgreSQL connection string:"
  echo "  export DATABASE_URL='postgresql://user:pass@host:5432/dbname'"
  echo ""
  exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

# Check for node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
  echo ""
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
pnpm db:generate
echo ""

# Apply database migration (indexes)
echo "🗄️  Applying database migration (performance indexes)..."
echo ""
echo "The following indexes will be created:"
echo "  - idx_diagnostic_factor_student_concept_type"
echo "  - idx_retention_estimate_valid"
echo "  - idx_attempt_student_recent"
echo "  - idx_attempt_session_recent"
echo "  - idx_question_concept_difficulty_intent"
echo "  - idx_misconception_remediation_student_concept"
echo "  - idx_revision_queue_due"
echo "  - idx_concept_prerequisite_concept"
echo ""

read -p "Continue with migration? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Migration cancelled"
  exit 1
fi

pnpm db:push

echo ""
echo "✅ Migration applied successfully!"
echo ""

# Build application
echo "🔨 Building application..."
pnpm build
echo ""

echo "========================================="
echo "✅ Phase 1 Deployment Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Start your application"
echo "  2. Monitor latency metrics (target P50=400ms, P95=700ms)"
echo "  3. Check concept cache warming in logs"
echo "  4. Verify error rates stay <0.1%"
echo ""
echo "Rollback if needed:"
echo "  - Revert git commits"
echo "  - Drop indexes manually if DB overloaded"
echo ""
echo "See COGNA/PHASE_1_STATUS.md for full checklist"
