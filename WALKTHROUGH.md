# Building Cali TV — the full story, start to finish

This is the complete walkthrough of how a stock Android TV got turned into a
custom Cali-branded dashboard: every phase, in the order it actually
happened, including the dead ends and the bugs that looked like something
else at first. Written as source material for a video — each phase below
works as a chapter.

The whole project ran in one extended session on 2026-10-31, starting from
"I think I can get into my TV" and ending with a real working home-screen
replacement that launches other apps and opens Settings.

---

## Phase 1 — Getting onto the TV

**The goal:** the TV had never been touched for development before. Step
one was just proving we could talk to it at all.

1. On the TV itself: **Settings → About → tap the build number seven
   times** to unlock Developer Options (same trick as on an Android
   phone).
2. In Developer Options, turn on **Network debugging**. This is where
   Android TV differs from an Android phone — phones show a wireless
   pairing screen with a 6-digit code; Android TV just has a plain on/off
   toggle that opens the standard debug port.
3. From a computer on the same home network:
   ```
   adb connect <tv-ip-address>:5555
   ```
4. The first time, the **TV itself pops up an authorization dialog** — you
   have to accept it using the physical remote, not from the computer. Once
   accepted, the connection is trusted going forward.

That's it — full command-line access to the TV, the same kind of access a
developer has on their own Android phone.

---

## Phase 2 — Finding out what we were actually working with

Before writing anything, the TV got scoped out properly:

- `adb shell getprop` confirmed it was a genuine **Android 11 (Google TV
  platform)** box, not some closed-off smart TV OS — a generic
  MediaTek-chipset unit sold under a UK retail brand.
- `adb shell pm list packages` listed everything installed: Netflix,
  YouTube, Disney+, Amazon Video, Plex, Spotify, several Freeview Play
  apps, a built-in web browser, and — importantly — **the Google Play
  Store itself**, which meant this was a fully open, sideload-friendly
  device, not a locked-down one.

This mattered because it ruled out the riskier approach (rooting the
device, flashing a custom ROM, replacing the entire operating system) in
favour of the much safer one: install a normal app alongside everything
else already on the TV.

---

## Phase 3 — Building the first version

Cali already existed as a phone app and a tablet app, built with a
cross-platform toolkit (Capacitor) that packages a web page into a real
Android app. Adding Android TV support meant adding a **fourth version**
of that same app, built from scratch for a TV screen rather than reusing
the phone/tablet screens (those are designed for touch and a close-up
screen; a TV is controlled by a remote from across the room).

What this involved:
- A brand-new, simple web page — just a clock, some status info, and
  nothing else at first — built specifically for a TV-sized screen.
- A new build configuration telling the app-building tool to use this new
  page instead of the phone/tablet one.
- One small addition to the Android app's configuration file so the TV's
  own home screen would recognise Cali as a proper TV app and show it as
  a tile, the same way Netflix or YouTube show up as tiles.

The app built and installed cleanly on the first try. Launching it did
not go as smoothly — see Phase 4.

---

## Phase 4 — The "black screen" mystery

This was the first real debugging chapter, and it had **two unrelated
causes layered on top of each other**, which is exactly the kind of thing
that makes for a good "here's what actually went wrong" video segment.

**Problem:** the app installed and showed up as a tile, but opening it
showed a plain black screen. Nothing.

**Complication:** this particular TV's screenshot and screen-recording
tools are broken (a known driver bug on this chipset) — every screenshot
came back as a plain black image regardless of what was actually on
screen, so the obvious way to check "what's actually happening" was
useless. The fix for *that* was installing a free tool called **scrcpy**,
which mirrors the TV's screen live onto a laptop over the same network
connection, using a completely different method than a screenshot. That
became the main way to actually *see* the TV for the rest of the project.

With a working way to see the screen, the two real causes turned up:

1. **A wall of permission pop-ups.** The app was asking for camera,
   microphone, location, contacts and phone permissions on startup — all
   left over from the phone app's code — even though the TV screen never
   used any of them. That permission dialog was sitting on top of the
   screen, invisible against the black background, looking exactly like a
   broken app.
2. **A genuine graphics driver bug.** Once the permission issue was fixed,
   the screen was *still* black — but the page's own code was working
   fine underneath (confirmed by checking the TV's internal logs, which
   showed real data being fetched successfully). The TV's graphics chip
   was failing to draw anything on screen at all, a real bug in this
   particular device's video driver. The fix was telling the app to draw
   using the CPU instead of the graphics chip for this one TV build —
   slightly slower, but it actually works, which the alternative didn't.

Both fixes were scoped narrowly to the TV version only, so the existing
phone and tablet apps were never touched or put at risk.

---

## Phase 5 — Designing what it should actually look like

With a working blank screen in hand, the next step was figuring out what
should actually be *on* it. Six different visual directions were explored
and compared side-by-side before building anything further for real:

1. A minimal status glance (clock + a few info tiles) — essentially what
   was already built, just polished.
2. A full home-screen-style dashboard with app icons and a featured
   banner, like a real TV's own home screen.
3. An ambient/screensaver-style idle mode.
4. A grid-style "command centre" showing every department of the business
   at a glance.
5. A media-playback-focused control screen.
6. A merged version combining the clean minimal look with the richer
   home-screen imagery.

This stage was pure design exploration — no TV code was touched — and it
directly shaped the two redesigns that came later.

---

## Phase 6 — Getting real artwork instead of placeholders

The early mockups used plain coloured blocks standing in for movie/show
posters, since there's no way to pull Netflix's or Disney+'s own artwork
(they don't offer that to outside apps). But it turned out the home media
server setup already had everything needed to show **real** artwork for
anything hosted locally — it just hadn't been connected up yet.

- The home server already talks to the household's own media library
  system (which tracks and organises TV shows and films) and already had
  a working connection for pulling real cover art.
- One real bug was found and fixed along the way: the server was sending
  **full original-resolution images** (one example was a 4K image, nearly
  900KB) for what was only ever displayed as a small thumbnail. That was
  fixed to properly resize images down to thumbnail size before sending
  them — a change that quietly benefits every other screen in the Cali
  system that shows posters too, not just the TV.

Getting the resized, correctly-sized images to actually *display* on the
TV screen took three more rounds of debugging, each one a genuinely
separate bug hiding behind the previous "fix":

1. The TV's browser engine was **silently blocking** image downloads over
   a plain (non-secure) connection, even though the exact same kind of
   request for *data* (not images) was allowed through with just a
   warning. Switching to fetching the image data manually first, then
   handing it to the picture element, worked around this.
2. The standard web technique for that (a "blob URL") turned out to be
   **broken on this specific TV's software** — the image data downloaded
   correctly every time, but the picture element refused to display it, no
   error given. This was only found by adding direct instrumentation to
   the page itself and watching exactly what happened, rather than relying
   on the system's own logs. The fix was switching to a different, older
   technique (embedding the image data directly rather than referencing
   it) that doesn't have the same problem.
3. A setting meant to improve performance ("lazy loading", which delays
   loading images until they're about to be seen) turned out to mean the
   images **never loaded at all** on this TV — removed, since there's no
   real need for it on a small fixed set of pictures anyway.

---

## Phase 7 — Rebuilding it as a real dashboard

With real artwork working, the screen was rebuilt into a proper layout: a
large featured banner at the top (using the most recently added item from
the media library), rows of real poster artwork below it, and the status
information condensed into a strip along the bottom.

---

## Phase 8 — Making it actually control the TV

Up to this point, Cali's TV screen only *displayed* information — it
couldn't do anything. The next ask was for real control: being able to
launch Netflix, YouTube, or any other app, and open the TV's Settings,
directly from the Cali screen.

This needed a genuinely new piece of code — a small custom extension (an
Android "plugin") giving the web page permission to:
- List every app installed on the TV.
- Launch any of them.
- Open the TV's system Settings.

This worked immediately for mouse-style taps. **It did not work with the
TV remote**, and the reason turned out to be the most interesting
technical discovery of the whole project:

Android TV's remote sends simple directional signals (up/down/left/right)
that reach the app just fine — but a TV app built as a web page, like
Cali's, does **not automatically know what to do with them**. A phone or
tablet touchscreen doesn't need this because you touch exactly what you
want directly. A remote control needs the app itself to decide "the user
pressed down, so move the highlight to whichever button is below the
current one" — and nothing does that automatically. This isn't a bug, it's
just a piece that has to be built by hand for any TV app made this way.

So that's what got built: a small piece of logic that, every time an
arrow key is pressed, looks at everything on screen that can be selected,
works out which one is the nearest neighbour in that direction, and moves
the highlight there. Confirmed working by literally remote-controlling the
TV from the Cali screen and watching Disney+ actually open.

A separate small discovery while testing Settings: opening it worked
correctly from the very first attempt — it showed the TV's full settings
menu (Network, Apps, Accounts, Device Preferences, and so on), confirmed
by directly inspecting what was on screen.

---

## Phase 9 — Matching the look of a real TV home screen

The final step was a visual pass, directly comparing the Cali dashboard
against a real Google TV home screen side-by-side and closing the gaps:

- **Real app icons.** Previously each app in the list was shown as a
  plain coloured circle with its first letter. The new plugin code was
  extended to pull each app's actual icon image directly from the TV
  itself, so the row of apps now looks like a normal app shelf.
- **An integrated status card inside the banner.** Real TV home screens
  use the space under the featured banner for a promotional notice. On
  Cali's version, that same spot now shows the single most important
  thing Cali has to flag right now — or a simple "all clear" message when
  there's nothing to report.
- **Icon-led status chips**, matching the pill-shaped info chips real TV
  home screens use for quick info.

---

## Where it stands now

A fully working, from-scratch Android TV app that:
- Shows up as its own tile on the TV's home screen, without touching or
  replacing anything already there.
- Displays a live, auto-refreshing dashboard with real household/business
  status information.
- Shows real artwork for recently-added and on-the-way media.
- Lists every app on the TV with its real icon, and can actually launch
  any of them.
- Can open the TV's full Settings menu.
- Is fully navigable with the ordinary TV remote.

**Not yet done**, for anyone picking this up next: making Cali the TV's
actual default home screen (so it's the very first thing you see when the
TV turns on, rather than a tile you switch to), and a custom icon for the
app tile itself (it currently uses a generic placeholder icon).
