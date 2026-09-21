/* =============================================================================
 * config.js — THE ONE FILE YOU EDIT TO CHANGE HOW THE SITE IS WIRED UP
 * =============================================================================
 *
 * Everything that depends on *where* the site lives or *which services* it talks
 * to is in here. Nothing else in the codebase hardcodes a domain, a repo name,
 * or an API key.
 *
 * Moving to a new web address?  You do not need to change anything here.
 * All URLs are worked out at runtime from where the files actually sit (see
 * base.js), so the site works identically on:
 *      https://AnhoRhino.github.io/
 *      https://anders.example.com/
 *      http://localhost:8000/
 *      file:///home/anders/.../index.html
 * The only thing tied to a name is `github` below, which is the *repository*
 * the admin panel writes to — that only changes if you rename the repo.
 * ---------------------------------------------------------------------------*/

export const CONFIG = {

  /* --- The repository the /backend admin panel commits content to ----------
   * Only used by /backend. The public site never touches GitHub.            */
  github: {
    owner:    'AnhoRhino',
    repo:     'AnhoRhino.github.io',
    branch:   'main',
    dataDir:  'data',                  // where the three .json files live
    imageDir: 'assets/img/uploads',    // where admin-uploaded images go
  },

  /* --- Contact form --------------------------------------------------------
   * Your real email address is NEVER in this file or anywhere in the page
   * source. It is stored on the relay service's side and looked up from the
   * access key below.
   *
   * TO ACTIVATE (takes about 30 seconds, free, no account needed):
   *   1. Go to https://web3forms.com
   *   2. Type the address you want messages delivered to into the box and
   *      press "Create Access Key"
   *   3. Check that inbox for the key and paste it below, replacing
   *      'PASTE-YOUR-WEB3FORMS-ACCESS-KEY-HERE'.
   * Until you do that, the form shows a friendly "not configured yet" notice
   * instead of silently failing.
   *
   * To switch provider later, change `provider` to 'formspree' and put the
   * form id (the bit after /f/) in `accessKey`. Nothing else changes.        */
  contact: {
    provider:  'web3forms',                            // 'web3forms' | 'formspree'
    accessKey: 'PASTE-YOUR-WEB3FORMS-ACCESS-KEY-HERE',
    subject:   'New message from your website',
  },

  /* --- Defaults ------------------------------------------------------------ */
  defaults: {
    theme: 'dark',   // 'dark' | 'light'  — what a first-time visitor sees
    lang:  'en',     // 'en'   | 'no'
  },

  /* --- Background constellations ------------------------------------------
   * Turn the dials here; the engine reads these on start.
   * `density` scales how many constellations are placed (1 = default).
   * `opacity` multiplies the whole layer (0 = invisible, 1 = full strength).  */
  constellations: {
    enabled:        true,
    density:        1.0,
    opacity:        1.0,
    pointerRadius:  170,   // px — how far from the cursor stars start to move
    pointerForce:   1.0,   // scales the push strength
    parallax:       true,  // background drifts down as you scroll (content "rises")
  },

  /* --- CV timeline ---------------------------------------------------------
   * pxPerYear controls how tall the timeline is. Bigger = more spread out.   */
  timeline: {
    pxPerYear:      260,
    minBraceHeight: 44,
    collapseGaps:   true,  // squash long empty stretches between jobs
  },
};

/* The tabs in the top navigation. Add one here and it appears everywhere.
 * `path` is relative to the site root. `scrollTo` is an optional element id to
 * scroll to instead of navigating (used so Home and CV share one page).       */
export const NAV = [
  { id: 'home',     path: '',          labels: { en: 'Home',     no: 'Hjem'      } },
  { id: 'cv',       path: '',          labels: { en: 'CV',       no: 'CV'        }, scrollTo: 'cv' },
  { id: 'projects', path: 'projects/', labels: { en: 'Projects', no: 'Prosjekter'} },
  { id: 'contact',  path: 'contact/',  labels: { en: 'Contact',  no: 'Kontakt'   } },
];
