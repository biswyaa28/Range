#!/usr/bin/env bash
# Create the release keystore and print the fingerprints Firebase needs.
#
# Usage:
#   KEYSTORE_PASSWORD=... KEY_PASSWORD=... ./scripts/make-keystore.sh
#
# The keystore and keystore.properties are git-ignored. Back both up: losing
# them means Play cannot verify updates from the same signing identity unless
# Play App Signing is enabled (recommended, see docs/ANDROID_RELEASE.md).
set -euo pipefail

cd "$(dirname "$0")/.."
KEYSTORE="${KEYSTORE_PATH:-android/personal-os-release.jks}"
ALIAS="${KEY_ALIAS:-personal-os}"
: "${KEYSTORE_PASSWORD:?Set KEYSTORE_PASSWORD}"
: "${KEY_PASSWORD:?Set KEY_PASSWORD}"

if [[ -e "$KEYSTORE" ]]; then
  echo "Refusing to overwrite $KEYSTORE" >&2
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=Personal OS, OU=Mobile, O=Biswajeet Rout, L=, ST=, C=IN"

cat > android/keystore.properties <<EOF
storeFile=$(cd android && pwd)/$(basename "$KEYSTORE")
storePassword=$KEYSTORE_PASSWORD
keyAlias=$ALIAS
keyPassword=$KEY_PASSWORD
EOF

echo
echo "Created $KEYSTORE and android/keystore.properties (both git-ignored)."
echo "Add these SHA-1 / SHA-256 fingerprints to Firebase > Project settings > Your apps > Android:"
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$KEYSTORE_PASSWORD" \
  | grep -E "SHA1:|SHA256:"
