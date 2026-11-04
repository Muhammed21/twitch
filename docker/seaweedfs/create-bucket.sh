#!/bin/sh
set -eu

if echo "s3.bucket.list" | weed shell -master=s3:9333 2>/dev/null | grep -qx "  ${S3_BUCKET}"; then
  echo "s3-init : bucket ${S3_BUCKET} déjà présent"
else
  echo "s3.bucket.create -name ${S3_BUCKET}" | weed shell -master=s3:9333
  echo "s3-init : bucket ${S3_BUCKET} créé"
fi

echo "fs.configure -locationPrefix=/buckets/${S3_BUCKET}/incoming/ -ttl=1d -apply" | weed shell -master=s3:9333 >/dev/null
echo "s3-init : dépôts sous incoming/ effacés au bout d'un jour"
