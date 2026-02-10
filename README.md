# Applaudimètre (web) 🎤📊

[Page en ligne](https://julienrat.github.io/applaudimetre/)

Page web qui mesure le niveau sonore via le micro du téléphone et affiche une barre colorée avec lissage type sonomètre (pondération rapide/lente) et maintien du pic. Prévue pour une future connexion Web Bluetooth à un ESP32.

## Fichiers 📁

- `index.html` : structure de la page
- `style.css` : styles
- `app.js` : logique audio (RMS, lissage, pic)
- `serve.py` : serveur local (HTTP/HTTPS)

## Lancer en local 🚀

### HTTP (desktop uniquement)

```bash
python3 serve.py
```

### HTTPS (requis sur mobile pour l'accès micro)

1. Générer un certificat auto‑signé (une fois) :

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

2. Lancer le serveur en HTTPS :

```bash
python3 serve.py --https
```

Un avertissement de sécurité peut apparaître sur le téléphone (certificat auto‑signé). Il faut l'accepter pour accéder au micro.

## Déploiement GitHub Pages 🌐

1. Pousser le dossier sur un dépôt GitHub.
2. Dans les paramètres du dépôt, activer GitHub Pages sur la branche principale.
3. La page sera disponible sur `https://<user>.github.io/<repo>/`.

Lien direct pour ce projet : `https://julienrat.github.io/applaudimetre/`

## Notes ℹ️

- dBFS = niveau numérique (pas dB SPL).
- Pondération rapide = 125 ms, lente = 1 s.
- Le pic est maintenu puis décroît progressivement.

## Dépannage 🛠️

- Sur mobile, l'accès micro nécessite **HTTPS**. Utilise `python3 serve.py --https` et accepte le certificat auto‑signé.
- Sur iOS/Android, l'accès micro n'apparaît qu'après une action utilisateur (bouton).
- Si la page ne se charge pas depuis le téléphone, vérifie que le téléphone et le PC sont sur le **même Wi‑Fi**.
- Si le navigateur bloque le micro, autorise l'accès dans les paramètres du site.

## TODO (Web Bluetooth + ESP32 + NeoPixel) ✅

- Découvrir et connecter l'ESP32 en Web Bluetooth.
- Définir un protocole simple (ex: niveau 0‑100, seuils, couleurs).
- Envoyer le niveau sonore en temps réel (lissé) vers l'ESP32.
- Allumer une barre NeoPixel en fonction du niveau.
- Tester latence et stabilité sur mobile.
