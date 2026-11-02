# Notice: third-party characters, voices and assets

Brainrotten (the website, the API, the MCP server and the BrainRotGram app) is an **unofficial, non-commercial fan and educational project** made for a hackathon. It is **not affiliated with, sponsored by or endorsed by** any of the companies, studios, broadcasters or people named below. All characters, names, likenesses, voices, trademarks and footage listed here **belong to their respective owners**. Brainrotten claims no ownership of them, and nothing in this repository grants anyone a licence to them.

Our own code is separate from this content and is MIT-licensed (see [LICENSE](LICENSE)); that licence does not extend to anything listed here. Credits below are attribution, not permission.

## Cartoon characters

| Characters in Brainrotten | Source series | Rights holders |
|---|---|---|
| Oggy, Jack, and the three cockroaches Joey, Dee Dee and Marky (shown here as **Jhaplu**, **Paplu** and **Taplu**) | *Oggy and the Cockroaches* | Xilam Animation (seasons 1–2 co-produced with Gaumont Multimédia) |
| Motu, Patlu, Chingum, Dr Jhatka, Ghasitaram, John | *Motu Patlu* | Cosmos-Maya and Viacom18 (Nickelodeon India); based on characters from *Lotpot* comics (Lotpot Group) |
| Badri (Badrinath), Budhdev (Budhdeb) | *Bandbudh Aur Budbak* | Paperboat Animation Studio |

The character pictures in `oggy/`, `cockroaches/`, `motupatlu/`, `budbak/` and `apps/web/public/characters/` are cutouts of existing artwork, some cleaned up with an image editor. They are not original designs. The folder READMEs and `*-source.json` files list where each reference came from; those pages do not grant a redistribution licence.

## Voices

The character voices are **synthetic voice clones** made with ElevenLabs (and an optional local model) from short clips of the series above, listed in each character's `metadata.csv`. The original performances belong to the voice actors and the series' rights holders. Every line a character says in a Brainrotten video is **AI-generated text spoken by a clone**: the original actors did not say it and have not approved it.

## Gameplay backgrounds

Muted, cropped excerpts used as video backgrounds (details and source links in `apps/companion/assets/gameplay/sources.json`):

| Clip | Game | Game rights holder | Uploader |
|---|---|---|---|
| `subway-surfers.mp4` | Subway Surfers | SYBO Games | Subway Surfers (YouTube) |
| `gta-stunts.mp4` | Grand Theft Auto V | Rockstar Games / Take-Two Interactive | RipstaStylez (YouTube, CC BY) |
| `minecraft-lava.mp4`, `minecraft-end.mp4` | Minecraft | Mojang Studios / Microsoft | BlockVista (YouTube) |

The uploaders describe these clips as free to use. That is their claim, not a licence from the game publishers.

## Open-source assets we ship

| Asset | Author | Licence |
|---|---|---|
| Basteleur, Uncut Sans, Pilowlava, Virgil (Excalidraw), Roboto, Roboto Mono, Noto Sans Devanagari, Space Grotesk fonts | Their designers | SIL Open Font License 1.1 (files in `apps/web/public/fonts/`) |
| PicNic font | Mariel Nils | CUTE licence (`apps/web/public/fonts/PicNic-CUTE-License.txt`) |
| Emoji graphics | Twemoji, © Twitter, Inc. and other contributors | CC BY 4.0 |
| Interface icons | Lucide contributors | ISC |
| Brand icons | Simple Icons contributors | CC0; the logos themselves are trademarks of their owners |
| Hand-drawn shapes / graph layout | rough.js, dagre | MIT |
| 3D gummy bear model | Grab3D | CC0 (`apps/web/public/models/GUMMY-LICENSE.txt`) |
| Soft-body physics | Squishy Lab contributors | MIT (`apps/web/src/vendor/squishy-lab/LICENSE`) |

Package dependencies keep their own licences in `node_modules` and the lockfile.

## Rules for using this project

- Keep it **non-commercial**: no ads, sales, paid plans or sponsorship built on these characters or voices.
- Keep this notice and the on-screen disclaimer when you share the site, the app or videos made with it.
- Do not present a cloned voice as the real actor or the show's official content.
- To use the code beyond a demo, replace the characters and voices with original ones you own or have licensed.

## Removal requests

If you hold rights in anything listed here and want it removed, contact the project owner (the support address on the Google sign-in screen, or the repository owner on GitHub). We will remove it promptly.
