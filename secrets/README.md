# Local Secrets & Credentials

Direktori ini menyimpan kredensial OAuth lokal, token akses sosmed, dan private key yang **tidak boleh dicommit ke Git** (di-ignore di `.gitignore`):

- `client_secret_*.json` — OAuth Client credentials dari Google Cloud Console (YouTube Data API v3).
- `social-tokens.json` — Refresh token & access token OAuth lokal untuk `nc social`.
- `*.pem`, `*.key`, `*.cert` — Sertifikat atau kunci privat lokal.
