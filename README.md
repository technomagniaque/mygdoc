# Google Docs Desktop (`gdocs-ferdium`)

Client de bureau Linux natif (Debian 13 Trixie & CachyOS / Arch Linux sous KDE Plasma 6) combinant une interface multi-services façon **Ferdium** avec le véritable éditeur **Google Docs**, l'extension officielle **Google Docs Offline** et une synchronisation bidirectionnelle avec **Dolphin**.

## Fonctionnalités

1. **Conteneur Multi-Services (Electron + `WebContentsView`)** :
   - Session persistante isolée `persist:google-workspace`.
   - Barre latérale rétractable avec Google Drive épinglé, création rapide (Doc, Sheet, Slides), onglets ouverts et services web personnalisés.
2. **Extension Google Docs Offline native (`ghbmnnjooekpmoecnnnilnnbdlolhkhi`)** :
   - Téléchargement automatique de l'archive CRX3 officielle au premier lancement, décompression et chargement via `session.loadExtension`.
   - `User-Agent` Chrome Linux standard et permissions automatiques (`clipboard-read`, `clipboard-write`, `persistent-storage`, `notifications`, `background-sync`).
   - Vérification hebdomadaire silencieuse des mises à jour.
3. **Thème Sombre Haute Lisibilité (Anti-fatigue oculaire)** :
   - Moteur `darkreader` + feuille de style dédiée pour le rendu Canvas Google Docs (`.kix-canvas-tile-content`).
   - Réglages manuels en temps réel par onglet : **Contraste feuille**, **Noirceur fond feuille**, **Contraste menus / UI**, **Luminosité**, **Sépia**, toggle **Feuille sombre (Canvas)** et préréglages (*Doux*, *Net +*, *Ambre*).
4. **Intégration Dolphin / KDE Plasma 6** :
   - Fichier `.desktop` avec associations MIME (`.doc`, `.docx`, `.odt`, `.md`).
   - Import automatique à l'ouverture depuis Dolphin vers le dossier Drive `Imports_Dolphin` avec conversion en Google Doc.
   - Export automatique toutes les 30 secondes (ou immédiatement sur `Ctrl+S`) vers le fichier local d'origine.

## Raccourcis clavier

- `Ctrl+T` : Nouveau Google Doc
- `Ctrl+W` : Fermer l'onglet actif
- `Ctrl+Tab` : Onglet suivant
- `Ctrl+S` : Forcer l'export local immédiat
- `Ctrl+Shift+D` : Activer / désactiver le thème sombre

## Développement & Build

```bash
npm install
npm run build
npm test
npm start
```

### Empaquetage Debian 13 (`.deb`)

```bash
npm run dist:deb
# Artefact : release/gdocs-ferdium_1.0.0_amd64.deb
```

### Empaquetage CachyOS / Arch Linux (`PKGBUILD`)

```bash
./scripts/build-arch-pkg.sh
cd release/arch && makepkg -si
```
