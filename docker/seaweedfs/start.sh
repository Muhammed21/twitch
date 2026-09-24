#!/bin/sh
set -eu

cat >/tmp/s3.json <<JSON
{
  "identities": [
    {
      "name": "dev",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
JSON

exec weed server -dir=/data -ip.bind=0.0.0.0 -s3 -s3.port=8333 -s3.config=/tmp/s3.json -volume.max=0 -master.volumeSizeLimitMB=64
