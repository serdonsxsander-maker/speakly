#!/usr/bin/env bash
set -e

# Speakly GitHub Release Publisher
# Usage: ./scripts/publish-release.sh v1.0.0

TAG=${1:-"v1.0.0"}
echo "Preparing Speakly Release for tag: $TAG..."

DIST_DIR="$(cd "$(dirname "$0")/../app/dist" && pwd)"
MAC_ARM="$DIST_DIR/Speakly-1.0.0-mac-arm64.dmg"
MAC_X64="$DIST_DIR/Speakly-1.0.0-mac-x64.dmg"
WIN_SETUP="$DIST_DIR/Speakly-Setup-1.0.0-win.exe"
WIN_PORTABLE="$DIST_DIR/Speakly-1.0.0-win-portable.exe"
CHECKSUMS="$DIST_DIR/SHA256SUMS.txt"

for f in "$MAC_ARM" "$MAC_X64" "$WIN_SETUP" "$WIN_PORTABLE"; do
  if [ ! -f "$f" ]; then
    echo "Error: Missing installer file: $f"
    exit 1
  fi
done

echo "All 4 installers verified in app/dist/:"
ls -lh "$MAC_ARM" "$MAC_X64" "$WIN_SETUP" "$WIN_PORTABLE"

if command -v gh &> /dev/null; then
  echo "GitHub CLI found. Creating release $TAG and uploading assets..."
  gh release create "$TAG" \
    "$MAC_ARM" \
    "$MAC_X64" \
    "$WIN_SETUP" \
    "$WIN_PORTABLE" \
    "$CHECKSUMS" \
    --title "Speakly $TAG (Early Access)" \
    --notes "### Speakly $TAG Early Access Release

- **High-Speed Voice-to-Text**: Groq LPU transcription (~290ms latency)
- **AI Formatting Engine**: Llama-3.3-70b-versatile prompt polish & grammar cleanup
- **Smart Modes**: Cursor Prompting, Casual Chat, Email, Raw Verbatim
- **Platform Support**: macOS (Apple Silicon + Intel) and Windows (Installer + Portable)

#### Checksums (SHA-256):
\`\`\`
$(cat "$CHECKSUMS")
\`\`\`
"
  echo "Release $TAG published successfully!"
else
  echo "GitHub CLI (gh) is not installed."
  echo "You can tag the release with git:"
  echo "  git tag $TAG"
  echo "  git push origin $TAG"
  echo "And drag the 4 installer files from app/dist/ directly into the GitHub Releases web UI at:"
  echo "  https://github.com/<YOUR_USER>/<YOUR_REPO>/releases/new?tag=$TAG"
fi
