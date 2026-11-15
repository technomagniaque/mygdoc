#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/release/arch"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"

echo "[1/3] Compilation TypeScript + Renderer..."
cd "$ROOT_DIR"
npm run build

echo "[2/3] Création de l'archive source pour PKGBUILD..."
mkdir -p "$PKG_DIR"
TARBALL="mygdoc-${VERSION}.tar.gz"
tar --exclude='node_modules' --exclude='release' --exclude='.git' \
  -czf "$PKG_DIR/$TARBALL" -C "$ROOT_DIR" .

echo "[3/3] Génération du PKGBUILD CachyOS / Arch Linux..."
cat > "$PKG_DIR/PKGBUILD" <<EOF
# Maintainer: Etienne
pkgname=mygdoc
pkgver=${VERSION}
pkgrel=1
pkgdesc="Client de bureau Linux natif pour Google Docs (en ligne & hors-ligne) avec thème sombre et intégration Dolphin"
arch=('x86_64')
url="https://github.com/technomagniaque/mygdoc"
license=('MIT')
depends=('electron' 'libsecret' 'nss')
makedepends=('nodejs' 'npm')
source=("${TARBALL}")
sha256sums=('SKIP')

build() {
  cd "\$srcdir"
  npm ci --ignore-scripts
  npm run build
}

package() {
  cd "\$srcdir"
  install -dm755 "\$pkgdir/usr/lib/mygdoc"
  cp -r dist package.json node_modules "\$pkgdir/usr/lib/mygdoc/"

  install -dm755 "\$pkgdir/usr/bin"
  cat > "\$pkgdir/usr/bin/mygdoc" <<'LAUNCHER'
#!/usr/bin/env bash
exec electron /usr/lib/mygdoc --enable-features=UseOzonePlatform,WaylandWindowDecorations --ozone-platform-hint=auto "\$@"
LAUNCHER
  chmod 755 "\$pkgdir/usr/bin/mygdoc"

  install -Dm644 build/mygdoc.desktop "\$pkgdir/usr/share/applications/mygdoc.desktop"
  install -Dm644 build/icons/512x512.png "\$pkgdir/usr/share/icons/hicolor/512x512/apps/mygdoc.png"
}
EOF

echo "PKGBUILD généré dans : $PKG_DIR/PKGBUILD"
echo "Sur CachyOS : cd $PKG_DIR && makepkg -si"
