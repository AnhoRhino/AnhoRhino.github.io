# AnhoRhino.github.io

Personal CV and projects site. Plain HTML, CSS and JavaScript — no build step,
no npm, nothing to compile. Edit a file, commit it, it is live.

**Live:** https://AnhoRhino.github.io · **Editor:** https://AnhoRhino.github.io/backend

---

## The two things to do first

The site works right now, but two things need a value from you:

### 1. Turn on the contact form (~30 seconds)

Your email address is deliberately not in this repository. A relay service
holds it instead, so the form works without ever publishing the address.

1. Go to **https://web3forms.com**
2. Type the address you want messages delivered to into the box and press
   **Create Access Key**
3. Check that inbox — they email you a key
4. Open `/backend` → **Home** tab → **Contact form** → paste the key → **Publish**

Until then the form politely says it is not connected yet, instead of
swallowing messages.

### 2. Create your editor login (~2 minutes)

See [Editing the site](#editing-the-site) below.

---

## Editing the site

All the content lives in three files:

| File | What it holds |
|---|---|
| `data/site.json` | Your name, tagline, intro, photo, links, skills, contact key |
| `data/cv.json` | Every CV entry |
| `data/projects.json` | Every project |

You never have to touch them by hand. Go to **`/backend`** — a page that exists
but is not linked from anywhere on the site — and edit them through a proper
interface. Pressing **Publish** commits straight to this repository; GitHub
Pages rebuilds and the change is live, usually within a minute.

### First-time setup

The editor needs a GitHub token so it can commit on your behalf.

1. Open https://github.com/settings/personal-access-tokens/new
2. Choose **Fine-grained token**
3. **Repository access** → *Only select repositories* → `AnhoRhino/AnhoRhino.github.io`
4. **Permissions** → *Repository permissions* → **Contents** → **Read and write**
   (nothing else — that is the only permission needed)
5. Set an expiry you are comfortable with, generate it, copy it
6. Go to `/backend`, paste the token, and choose a password

The token is then encrypted with your password (PBKDF2 → AES-GCM) and stored in
that browser. From then on you only type the password. Do this once per device.

### What the editor can do

- **Home** — name, tagline, intro, photo, links, skill groups, contact key
- **CV** — add, duplicate, delete entries; company, role, dates, bullets, tags.
  Every text field has an EN and a NO box.
- **Projects** — add and delete, **drag or use the arrows to reorder** (the page
  shows them in exactly that order), upload a cover image and a gallery
- **Settings** — change password, download backups, forget the token

Images are resized to 1600px and re-compressed in your browser before upload, so
a 4 MB phone photo becomes about 200 KB.

> **Note on CV order:** the timeline positions entries by *date*, not by their
> order in the file, so there is no drag handle on the CV tab. Change the dates
> and it moves. Projects *are* ordered by the file, so those you can drag.

### Editing without the admin panel

Everything in `/backend` is a convenience. You can always edit `data/*.json`
directly on github.com and it works identically.

---

## How it is put together

```
index.html              Home + CV  (one scrolling page)
projects/index.html     /projects
contact/index.html      /contact
backend/index.html      /backend   — the editor, not linked from the site
data/*.json             all content
assets/css/             tokens.css → base.css → pages.css → timeline.css
assets/js/              one module per job
tools/                  a local preview server and the constellation generator
```

The previous version of the site is not in the working tree — it is in git
history, which is a better place for it. `git log --oneline` to find a commit,
then e.g. `git show f438fe6:Backup.html > old-backup.html` to get a file back.
It was removed because GitHub Pages serves *everything* in the repository, and
the old `Backup.html` had your email address in a `mailto:` link — exactly the
thing this rebuild is meant to stop publishing.

### The JavaScript, one line each

| File | Job |
|---|---|
| `config.js` | **Every setting in one place.** Repo, contact relay, defaults, tuning. |
| `base.js` | Works out the site's own address at runtime, so it can be moved. |
| `app.js` | The single entry point. Boots everything, runs the right page. |
| `data.js` | Loads the three JSON files. |
| `i18n.js` | Norwegian / English. `t()` for content, `ui()` for buttons. |
| `theme.js` | Dark / light. |
| `router.js` | Soft page transitions, so the star field is never destroyed. |
| `reveal.js` | Content rising from the bottom, fading near the top. |
| `constellations.js` | The star field, its physics and its sleep logic. |
| `timeline.js` | The CV timeline: time scale, curly braces, column packing. |
| `home.js` | The front-page hero. |
| `projects.js` | The projects grid and the detail dialog. |
| `contact.js` | The contact form and its relay adapters. |
| `vault.js` | Encrypts the GitHub token behind your password. |
| `github.js` | Reads and writes files in this repository. |
| `admin/*.js` | The editor UI. |

### Changing how it looks

Every colour, size and timing is a custom property in
**`assets/css/tokens.css`**. Nothing else in the CSS contains a raw colour, so
changing the palette means editing one file.

Both themes are one blue hue (~228°) at different lightnesses, plus a single ice
blue accent. Contrast is measured, not guessed — body text is AAA in both
themes and every text/background pair clears AA. If you change a colour,
re-check it; muted grey on the hover shade is the tightest pair.

### The constellations

Real star positions, stereographically projected so the shapes are genuine —
the Plough looks like the Plough. To add one, edit the catalogue in
`tools/gen_constellations.py`, run it, and paste the output over the
`CONSTELLATIONS` array in `assets/js/constellations.js`.

```bash
python3 tools/gen_constellations.py
```

Stars are pushed away from the cursor and spring back (damped harmonic motion,
ζ ≈ 0.5, so one small overshoot). The animation loop **stops completely** once
everything is still, so an idle tab costs nothing.

Dials are in `config.js` under `constellations` — `density`, `opacity`,
`pointerRadius`, `pointerForce`, `parallax`, and `enabled: false` to turn the
whole thing off.

### The CV timeline

- Months map to pixels on a piecewise-linear scale; long empty stretches
  compress to a small gap with a break mark on the axis.
- Each brace's height *is* the length of that job. The curls are a fixed size
  and the straight sections absorb the difference, so a three-month brace and a
  ten-year brace both look right.
- Entries alternate right and left. When two overlap in time they go on
  opposite sides; when more overlap than fit, the extras step outward into
  another column. Nothing is ever allowed to collide.
- Below 860px it becomes a single column with the axis on the left.

Tuning is in `config.js` under `timeline`: `pxPerYear`, `minBraceHeight`,
`collapseGaps`.

---

## Running it locally

```bash
python3 tools/serve.py
```

Then open http://localhost:8765. (Opening `index.html` as a file will not work —
browsers block `fetch` on `file://`, so the JSON never loads.)

The editor at `/backend` works locally too, and commits to the real repository.

---

## Moving to a different web address

Nothing in the code knows where it lives — every URL is worked out at runtime
from where the files actually sit. So:

- **A custom domain:** add a `CNAME` file with your domain and point the DNS at
  GitHub. No code changes.
- **A different host entirely:** upload the folder. It is all static files.
- **Renaming the repository:** update `github.owner` / `github.repo` in
  `assets/js/config.js` so the editor still knows where to commit. That is the
  one place a repo name appears.

---

## Security, honestly

- `/backend` is **public** — it is simply not linked or indexed. Anyone who
  guesses the URL sees a password box, nothing more.
- Your password protects the **token stored in this browser**, not the page.
- The real backstop is the token's own scope. Fine-grained, this repository
  only, `Contents: Read and write`, with an expiry. Then the worst case if it
  leaks is that someone edits this one website — and you can revoke it from
  GitHub in ten seconds.
- Your email address is not in this repository any more. Check any time — this
  should print nothing, and any hit is an address about to be published:

  ```bash
  grep -rIn -E "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" . --exclude-dir=.git
  ```

### About the old site and your address

The previous `Backup.html` had your address in a `mailto:` link, and GitHub
Pages was serving it at `/archive/Backup.html`. That file is now gone, so
nothing on the live site exposes it.

Being straight with you about the rest: that page was public from September
2023 until now, and the address is still in this repository's **git history**,
which is public too. Removing it from history means rewriting every commit
(`git filter-repo --replace-text`) and force-pushing — and even that does not
fully erase it, because the old commits stay reachable by their SHA on
github.com until GitHub garbage-collects them, which only happens if you ask
their support to. Forks and archives are untouched either way.

So: assume that address has already been scraped. The valuable part is what is
now done — nothing new is published, and the contact form never exposes it.
Rewriting history is optional tidying, not containment.

---

## Accessibility and the small print

- Keyboard-navigable throughout; visible focus rings in both themes. Focus
  moves into the new page after a tab change, and back to where you were after
  the admin rebuilds a list.
- Contrast is measured rather than eyeballed. Body text is AAA in both themes;
  every other text/background pair, including error and warning text and
  disabled buttons, clears AA.
- Honours `prefers-reduced-motion` — the star physics, the background
  parallax, the rise-and-fade and every animation stop.
- **Content can never be left invisible.** The rise-and-fade starts blocks
  transparent, so there are three independent fallbacks: a CSS rule for no-JS,
  a watchdog if IntersectionObserver never fires, and a timer in each page's
  `<head>` that forces everything visible if `app.js` never starts at all.
- The CV prints cleanly on A4 as a single column — `Ctrl/Cmd + P`.

## Known trade-offs

Things that are this way on purpose, so you do not "fix" them later and
wonder why it got worse:

- **The editor does not auto-lock while you have unpublished edits.** Locking
  would discard them. It tells you it is staying unlocked instead of doing it
  silently.
- **The `<head>` and top bar are duplicated in all four HTML files.** With no
  build step there is nowhere else to put them. If you change one — a new
  stylesheet, a new meta tag — change all four. The four pages must load the
  *same* stylesheets, because the soft router only swaps `<main>`.
- **Long ongoing roles leave vertical space.** The timeline is
  time-proportional, so a three-year job really does occupy three years of
  page. Turn `pxPerYear` down in `config.js` if you would rather it were
  tighter.
- **SVG uploads are refused.** SVG is markup and can carry scripts; nothing
  here needs vector images.
