#!/bin/bash

# iOS Build Fix Script for React Native
# This script fixes common "PhaseScriptExecution failed" errors

set -e

echo "=========================================="
echo "🔧 iOS Build Fix Script"
echo "=========================================="

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "📍 Project root: $PROJECT_ROOT"
echo ""

# Step 1: Update Node Binary Path
echo "✅ Step 1: Updating Node binary path..."
NODE_PATH=$(which node)
echo "export NODE_BINARY=$NODE_PATH" > ios/.xcode.env.local
echo "   Node path: $NODE_PATH"

# Step 2: Clean React Native cache
echo ""
echo "✅ Step 2: Cleaning React Native cache..."
rm -rf $TMPDIR/react-* 2>/dev/null || true
rm -rf $TMPDIR/metro-* 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
echo "   Cache cleared"

# Step 3: Clean iOS build artifacts
echo ""
echo "✅ Step 3: Cleaning iOS build artifacts..."
rm -rf ios/build 2>/dev/null || true
rm -rf ios/Pods/build 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/iDNS-* 2>/dev/null || true
echo "   Build artifacts cleaned"

# Step 4: Make scripts executable
echo ""
echo "✅ Step 4: Making React Native scripts executable..."
chmod +x node_modules/react-native/scripts/*.sh 2>/dev/null || true
chmod +x node_modules/react-native/sdks/hermes-engine/utils/*.sh 2>/dev/null || true
echo "   Scripts made executable"

# Step 5: Clean Xcode build
echo ""
echo "✅ Step 5: Cleaning Xcode build..."
cd ios
xcodebuild clean -workspace iDNS.xcworkspace -scheme iDNS > /dev/null 2>&1 || true
cd ..
echo "   Xcode build cleaned"

# Step 6: Reinstall Pods
echo ""
echo "✅ Step 6: Reinstalling CocoaPods..."
cd ios
bundle exec pod install --repo-update
cd ..
echo "   Pods reinstalled"

# Step 7: Clear watchman (if installed)
echo ""
echo "✅ Step 7: Clearing watchman..."
if command -v watchman &> /dev/null; then
    watchman watch-del-all 2>/dev/null || true
    echo "   Watchman cleared"
else
    echo "   Watchman not installed (skipping)"
fi

echo ""
echo "=========================================="
echo "✅ Build fix completed!"
echo "=========================================="
echo ""
echo "Now you can:"
echo "  1. Open Xcode and build the project"
echo "  2. Or run: npm run ios"
echo ""
