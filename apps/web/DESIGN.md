# Brainrotten Studio design

Warm cream `#faf5ee`, dark plum `#30263c`, lavender `#e9dff6`, purple action `#684393`, coral `#f0b19b`, yellow `#f1d181`. The composer is centered until an actual result is selected; composer and result then share two columns, collapsing on mobile. Video history sits below; settings expand in place. Studio and MCP remain the app tabs; the public site links Studio, MCP, API and Examples.

Basteleur Bold is the expressive display face for the wordmark and h1. Uncut Sans is the quieter control/body face. Body starts at 16px; labels/metadata have explicit 12–14px dense roles. Dialogue, captions and titles use Latin letters directly; video captions use standard Roboto and code uses Roboto Mono. Only current UI faces load in Studio; Pilowlava and PicNic are comparison-only assets at /type-study.html. All files are self-hosted with their actual licenses (PicNic uses CUTE, not OFL).

The user rejected the first Bochild/Autour pairing as looking bad and asked for Reddit/independent-foundry research. Preserve the current palette, structure, controls and behavior; typography is the changed axis. Basteleur’s eccentric serif carries personality in two places; dense controls stay clear. The three-pair study uses identical body type/colors to isolate the display choice.

No marketing tagline, redundant credits disclaimer, invented roles, or text banner in the video. The current character PNG appears alone in a render, beneath concise timed captions; optional code/image inserts sit above. Actual gameplay supplies motion. Small entry movement is limited to speaker changes, and unchanged overlay frames are reused. Reduced-motion preferences disable UI animation.

Controls have visible focus, native labels/selects/range, error/status roles, and readable contrast. There is no idle preview; active jobs show actual stages; completed jobs use native video controls and a download link. Automatic selection needs any two ready clones; a manual selection needs those two voices. Character selection uses AI chooses two / Choose speakers with a compact roster and native questioner/explainer selects. Responsive QA covers desktop and a real 390px emulated mobile viewport.

## Public site — 2026-10-28

The landing page borrows a video-library shelf: the hero is an explicitly playable real clip and a topic selector; staggered portrait sleeves show the output. Taste direction borrowed-category, seed 916167808. Preserve the established palette/type. Direct functional copy, no invented customer proof or hosted availability. The original SVG brain/play mark is shared by the site, Studio and favicon. No paid media or generated claims were added.

Four visible raster slots use actual user-directed video poster frames (one hero plus three examples); source links remain in the example metadata. Only the approved ElevenLabs pairs are public: John/Dr Jhatka, Jhaplu/Paplu and Badri/Budhdev. The other eleven clips were moved outside public assets. Static demo `/studio` offers setup rather than nonfunctional controls. Normal `/studio` preserves the existing generator.

Native video controls, deliberate playback, keyboard-accessible interface tabs, copy recovery, viewport-safe code, reduced-motion overrides and visible content before animation are required. Motion is a one-time shelf settle plus focused hover/press feedback. Code uses its real monospace face. No autoplaying audio or editor-specific prerequisite. Design artifacts and render QA stay in `.artifacts/release-prep/`.

## Public site — 2026-11-02

Landing order: hero (copy + gummy bears), a scroll-driven walkthrough, real-session examples (one tab per format), four ways in (MCP, Python, Studio, API), run options, FAQ. The walkthrough pins while the reader scrolls through a tall section; scroll position maps to story time, so each stretch advances one step and scrolling back rewinds. A clickable five-step rail and a caption name the current step. Below 1000px it shows one card at a time. Reduced motion shows the finished state as a normal section.

The header is one row at every width: brand, an account button (hosted: Google sign-in, or avatar plus free videos left) and, on small screens, a menu toggle that opens the links inside the pill. Studio links never force a Google redirect. The footer is a full-width plum band, not a pill: large wordmark, three link columns (Make, Connect, Run), and a thin rule above languages, credit and back to top.

## Legal — 2026-11-02

Every page footer carries a one-line disclaimer (unofficial, non-commercial fan project; characters and gameplay belong to their owners; voices are AI clones) with links to `/credits.html`, `/terms.html` and `/privacy.html`. Full attribution lives in `NOTICE.md`, mirrored on the credits page. This replaces the earlier no-credits rule.
