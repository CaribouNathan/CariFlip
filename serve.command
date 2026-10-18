#!/bin/bash
# CariFlip — lance un serveur local pour tester le jeu dans le navigateur du Mac.
# Double-cliquez ce fichier dans le Finder. Fermez la fenêtre Terminal pour arrêter.
cd "$(dirname "$0")" || exit 1
PORT=8080
echo "CariFlip : http://localhost:$PORT"
echo "Sur l'iPhone (même Wi-Fi) : http://$(ipconfig getifaddr en0 2>/dev/null || echo 'IP-du-Mac'):$PORT"
echo "(le mode hors ligne et l'installation exigent HTTPS : GitHub Pages)"
( sleep 1; open "http://localhost:$PORT" ) &
python3 -m http.server "$PORT"
