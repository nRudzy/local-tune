# 🎵 LocalTune

**Téléchargez vos vidéos et playlists YouTube en MP3 haute qualité, organisées par projets.**

LocalTune est une application web locale qui tourne entièrement dans Docker. Rien à installer sur votre machine (à part Docker).

---

## 🚀 Démarrage rapide

### Prérequis
- [Docker](https://docs.docker.com/get-docker/) et [Docker Compose](https://docs.docker.com/compose/install/) installés

### Lancement

```bash
# Cloner le projet
git clone <url-du-repo>
cd local-tune

# Lancer l'application
docker compose up -d --build
```

Puis ouvrir **http://localhost:3000** dans votre navigateur.

### Arrêt

```bash
docker compose down
```

---

## 📖 Comment ça marche

1. **Créez un projet** (ex: "Musiques pour Paulo")
2. **Collez une URL YouTube** (vidéo individuelle ou playlist entière)
3. **Le téléchargement démarre** — progression en temps réel
4. **Exportez en ZIP** quand vous voulez — mettez sur une clé USB, partagez, etc.

Chaque projet est un simple dossier dans `./data/`. Vos fichiers MP3 sont directement accessibles sur votre machine.

---

## 📁 Où sont mes fichiers ?

Tous les MP3 sont stockés dans le dossier `./data/` à la racine du projet :

```
data/
├── musiques-pour-paulo/
│   ├── Daft Punk - Around The World.mp3
│   ├── Daft Punk - One More Time.mp3
│   └── .meta.json
├── musique-pour-moi/
│   ├── Stromae - Papaoutai.mp3
│   └── .meta.json
└── ...
```

Ce dossier est un volume Docker monté sur votre machine. Vous pouvez y accéder directement.

---

## 🏗️ Architecture

```
local-tune/
├── docker-compose.yml          # Orchestration Docker
├── Dockerfile                  # Image avec Node.js + yt-dlp + ffmpeg
├── backend/                    # API Express.js
│   ├── server.js               # Point d'entrée
│   ├── routes/                 # Routes API REST
│   └── services/               # Logique métier
├── frontend/                   # Interface SPA (HTML/CSS/JS vanilla)
│   ├── index.html
│   ├── css/style.css
│   └── js/
└── data/                       # Vos MP3 (volume Docker)
```

---

## ❓ FAQ

**Q: Comment mettre à jour yt-dlp ?**
```bash
docker compose build --no-cache
docker compose up -d
```

**Q: Puis-je changer le port ?**
Modifiez le port dans `docker-compose.yml` :
```yaml
ports:
  - "8080:3000"   # Accéder via http://localhost:8080
```

**Q: Les MP3 sont supprimés si je supprime le conteneur ?**
Non ! Les fichiers sont dans `./data/` sur votre machine (volume monté). Seul `docker compose down -v` supprimerait les volumes.

**Q: Quelle qualité audio ?**
MP3 320 kbps — la meilleure qualité MP3 possible.

---

## 📄 Licence

Projet personnel — usage privé uniquement.
