# Third-party assets

Everything in this folder belongs to someone else. Brainrotten is an unofficial, non-commercial fan project; these files are **not** covered by the repository's MIT licence. Owners, licences and removal requests: [NOTICE.md](../NOTICE.md).

```
assets/
  characters/
    oggy-and-the-cockroaches/   Oggy, Jack, Jhaplu, Paplu, Taplu   (Xilam Animation)
    motu-patlu/                 Motu, Patlu, Chingum, Ghasitaram, Dr Jhatka, John   (Cosmos-Maya / Viacom18)
    bandbudh-aur-budbak/        Badri, Budhdev   (Paperboat Animation Studio)
  gameplay/                     Background clips: Subway Surfers, GTA V, Minecraft
```

Each character folder holds:

- `<id>.png`: the transparent cutout drawn in videos. The ids match `packages/media/src/characters.ts`; the website serves them at `/characters/<id>.png`.
- `voices/`: the clip lists used to make each AI voice clone. The recordings themselves stay on the maintainer's computer and are never committed (audio is git-ignored).
- `references/`: where the cutouts came from.

`gameplay/` holds muted, cropped background clips with their sources in `gameplay/sources.json`.

Only the cutouts and gameplay clips go into the hosted runtime image (`apps/cloud/Dockerfile`); voices and references are excluded by `.dockerignore`.
