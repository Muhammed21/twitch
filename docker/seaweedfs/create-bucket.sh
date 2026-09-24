#!/bin/sh
set -eu

if echo "s3.bucket.list" | weed shell -master=s3:9333 2>/dev/null | grep -qx "  ${S3_BUCKET}"; then
  echo "s3-init : bucket ${S3_BUCKET} déjà présent"
  exit 0
fi
echo "s3.bucket.create -name ${S3_BUCKET}" | weed shell -master=s3:9333
echo "s3-init : bucket ${S3_BUCKET} créé"
