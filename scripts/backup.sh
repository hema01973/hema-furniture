#!/usr/bin/env bash
# scripts/backup.sh — HemaV063
# V063 FIX-LOW-06: Encrypt backup before upload to prevent data breach on storage misconfiguration.
# Schedule: daily at 02:30 UTC via cron or GitHub Actions
# Usage: ./scripts/backup.sh [--dry-run]
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────
BACKUP_DIR="/tmp/ehema-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="ehema_backup_${TIMESTAMP}"
RETENTION_DAYS=30          # keep 30 days of backups
S3_BUCKET="${BACKUP_S3_BUCKET:-}"          # optional: S3 bucket name
MONGO_URI="${MONGODB_URI:?MONGODB_URI required}"
DRY_RUN="${1:-}"

log()   { echo "[$(date -Iseconds)] $*"; }
error() { echo "[$(date -Iseconds)] ERROR: $*" >&2; exit 1; }

log "=== EHema Backup Starting: ${BACKUP_NAME} ==="
[[ "$DRY_RUN" == "--dry-run" ]] && { log "[DRY RUN] Skipping actual dump"; exit 0; }

# ── Create backup directory ────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ── MongoDB dump ───────────────────────────────────────────────────
log "Dumping MongoDB..."
mongodump \
  --uri="${MONGO_URI}" \
  --out="${BACKUP_DIR}/${BACKUP_NAME}" \
  --gzip \
  --quiet

# ── Compress ───────────────────────────────────────────────────────
log "Compressing backup..."
ARCHIVE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
tar -czf "${ARCHIVE}" \
  -C "${BACKUP_DIR}" "${BACKUP_NAME}"
rm -rf "${BACKUP_DIR}/${BACKUP_NAME}"

BACKUP_SIZE=$(du -sh "${ARCHIVE}" | cut -f1)
log "Backup size: ${BACKUP_SIZE}"

# ── V063 FIX-LOW-06: Encrypt backup before upload to prevent data breach on storage misconfiguration.
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "[Backup] ERROR: BACKUP_ENCRYPTION_KEY is not set. Refusing to upload unencrypted backup."
  exit 1
fi

ENCRYPTED_ARCHIVE="${ARCHIVE}.enc"
openssl enc -aes-256-gcm -salt -pbkdf2 -iter 600000 \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  -in "${ARCHIVE}" \
  -out "${ENCRYPTED_ARCHIVE}"

log "Archive encrypted: ${ENCRYPTED_ARCHIVE}"
rm -f "${ARCHIVE}"

# ── Upload to S3 ───────────────────────────────────────────────────
if [[ -n "$S3_BUCKET" ]]; then
  log "Uploading to S3: s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz.enc"
  aws s3 cp \
    "${ENCRYPTED_ARCHIVE}" \
    "s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz.enc" \
    --storage-class STANDARD_IA \
    --metadata "timestamp=${TIMESTAMP},source=ehema-furniture"
  log "Upload complete"

  # Delete local after successful upload
  rm -f "${ENCRYPTED_ARCHIVE}"

  # ── Cleanup old backups from S3 ─────────────────────────────────
  log "Cleaning up backups older than ${RETENTION_DAYS} days..."
  CUTOFF=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || \
           date -v-${RETENTION_DAYS}d +%Y%m%d)  # macOS fallback
  aws s3 ls "s3://${S3_BUCKET}/backups/" | while read -r line; do
    FILE_DATE=$(echo "$line" | awk '{print $4}' | grep -oP '\d{8}(?=_)' || echo "")
    FILE_NAME=$(echo "$line" | awk '{print $4}')
    if [[ -n "$FILE_DATE" ]] && [[ "$FILE_DATE" < "$CUTOFF" ]]; then
      log "Deleting old backup: ${FILE_NAME}"
      aws s3 rm "s3://${S3_BUCKET}/backups/${FILE_NAME}"
    fi
  done
else
  log "No S3_BUCKET set — backup kept locally at ${ENCRYPTED_ARCHIVE}"
fi

log "=== Backup Complete ==="
