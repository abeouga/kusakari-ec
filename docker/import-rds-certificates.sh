#!/bin/sh
set -eu
mkdir -p /app/certs
cert_dir=$(mktemp -d)
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o "$cert_dir/bundle.pem"
awk -v dir="$cert_dir" '/-----BEGIN CERTIFICATE-----/ {n++} n {print > (dir "/cert-" n ".pem")}' "$cert_dir/bundle.pem"
for cert in "$cert_dir"/cert-*.pem; do
  keytool -importcert -noprompt -storetype PKCS12 -storepass changeit \
    -keystore /app/certs/rds.p12 -alias "$(basename "$cert")" -file "$cert"
done
# Build-stage temporary certificate files only; no runtime secrets are involved.
rm "$cert_dir"/*.pem
rmdir "$cert_dir"
