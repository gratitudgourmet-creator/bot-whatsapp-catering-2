#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/gratitud-erp/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gratitud-erp}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -d "$DATA_DIR" ]; then
  echo "No existe DATA_DIR: $DATA_DIR" >&2
  exit 1
fi

tar -czf "$BACKUP_DIR/gratitud-erp-data-$STAMP.tar.gz" -C "$DATA_DIR" .
find "$BACKUP_DIR" -name "gratitud-erp-data-*.tar.gz" -mtime +"$KEEP_DAYS" -delete

echo "Backup creado: $BACKUP_DIR/gratitud-erp-data-$STAMP.tar.gz"
