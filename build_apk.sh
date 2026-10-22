#!/bin/bash
# 陶土词卡打包：python3 src/build_html.py → aapt2 → javac → d8 → zipalign → apksigner
set -e
VERSION=${1:-1.1.0}
VC=${2:-3}
: "${ANDROID_JAR:?请设置 ANDROID_JAR 指向 platform/android-XX/android.jar}"
: "${TAOTU_KEYSTORE:?请设置 TAOTU_KEYSTORE 指向你的 .jks}"
: "${TAOTU_STORE_PASS:?请设置 TAOTU_STORE_PASS}"
AAPT2=${AAPT2:-aapt2}
D8=${D8:-d8}
ZIPALIGN=${ZIPALIGN:-zipalign}
APKSIGNER=${APKSIGNER:-apksigner}
cd "$(dirname "$0")"

python3 src/build_html.py
cp dist/index.html docs/index.html
cp dist/index.html android/assets/index.html

cd android
mkdir -p assets
rm -rf build && mkdir -p build/classes build/dex
sed -i "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$VC\"/; s/android:versionName=\"[^\"]*\"/android:versionName=\"$VERSION\"/" AndroidManifest.xml
$AAPT2 compile --dir res -o build/res.zip
$AAPT2 link -o build/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml -R build/res.zip -A assets \
  --min-sdk-version 23 --target-sdk-version 34 --auto-add-overlay
javac -source 8 -target 8 -encoding UTF-8 -nowarn -classpath "$ANDROID_JAR" \
  -d build/classes src/app/taotu/vocab/MainActivity.java
$D8 --min-api 23 --lib "$ANDROID_JAR" --output build/dex build/classes/app/taotu/vocab/*.class

python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/base.apk') as zi, zipfile.ZipFile('build/unsigned.apk', 'w') as zo:
    for it in zi.infolist():
        zo.writestr(it, zi.read(it.filename))
    zo.write('build/dex/classes.dex', 'classes.dex', compress_type=zipfile.ZIP_DEFLATED)
PY

zipalign -f 4 build/unsigned.apk build/aligned.apk
mkdir -p ../release
apksigner sign --ks "$TAOTU_KEYSTORE" --ks-key-alias taotu \
  --ks-pass "pass:$TAOTU_STORE_PASS" --key-pass "pass:$TAOTU_STORE_PASS" \
  --out "../release/taotu-vocab-$VERSION.apk" build/aligned.apk
apksigner verify --print-certs "../release/taotu-vocab-$VERSION.apk" | head -3
ls -l "../release/taotu-vocab-$VERSION.apk"
