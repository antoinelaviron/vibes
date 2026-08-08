# video-player — embed a video (MP4 or YouTube) in a dashboard tile

**Attribution:** adapted verbatim-in-shape from an internal reference
`dashboardVideoPlayer` implementation. That version is copied close to as-is —
this is already workshop-scoped (six `@api` properties, no SDK, no
Apex) and needs no simplification.

**What this teaches:** how to build an `analytics__Dashboard`
extension that has **no SDM query at all** — a pure media component
configured entirely from the dashboard property panel. It auto-detects
whether the configured URL is a YouTube link or a direct MP4 and
switches the rendered element (`<iframe>` vs `<video>`) accordingly.

**This is the one workshop pattern that skips SDM discovery.** Every
other reference in this skill starts from a `registerFieldsForQuery`
pipeline (Gate #2, #7). This one has nothing to discover — do not call
`tableau-next-workshop-sdm-discovery` for this pattern, and do not add
an `@api sdk` property. If the attendee's prompt asks for the video
tile to *also* show data (e.g. "and put the opportunity count next to
it"), that's two extensions, not one — keep the media player pure.

**Attendee prompt shape:** *"video player extension — embed a YouTube
video in a dashboard tile, autoplay muted, no controls."*

**Do NOT copy this file verbatim** — masterLabel, class name, and CSS
sizing are the only things that vary per attendee; the logic below is
already workshop-ready as written.

## Rules

- **No SDK, no `@api sdk`, no `connectedCallback` pipeline.** All
  state comes from `@api` property setters wired to the dashboard
  property panel (`js-meta.xml`). Nothing in this file touches
  `registerFieldsForQuery` or `registerDataSource`.
- **Detect YouTube vs MP4 from the URL, not a separate toggle.** A
  regex against `youtu.be/`, `youtube.com/watch?v=`, and
  `youtube.com/embed/` covers the three common formats attendees will
  paste. If none match, treat the URL as a direct MP4/static-resource
  link and render a native `<video>`.
- **Autoplay requires `muted: true`.** Every modern browser blocks
  unmuted autoplay — this is a browser rule, not a bug. Default
  `muted` to `true` in the meta.xml so the out-of-the-box config
  actually autoplays. If the attendee wants sound, `autoplay: false`
  + `controls: true` so they click play manually.
- **CSP: `youtube.com` needs Trusted Sites.** Salesforce enforces CSP
  on iframes. If the org hasn't trusted `https://www.youtube.com`, the
  tile renders blank with a console CSP violation, not a component
  error — flag this as **admin work outside Vibes' reach** (Setup →
  CSP Trusted Sites), not something to debug in the LWC. For a
  guaranteed-works-offline fallback, tell the attendee to upload the
  video as a Static Resource and reference it as `/resource/<name>` —
  that path never hits CSP.
- **YouTube mode is fully declarative** — build the embed URL as a
  getter (`iframeSrc`) driven by the current property values; no
  imperative DOM calls needed, the `<iframe src>` binding does the
  work.
- **Native `<video>` mode needs one imperative touch** — reassign
  `source.src` and call `video.load()` only when the URL actually
  changed, then re-apply `loop`/`muted`/`controls`/`autoplay` as DOM
  properties (not attributes) on every property-panel edit.
- **Don't use `lwc:dom="manual"` here.** Unlike the D3 charts, this
  component's DOM is declarative (`if:true` template branches) — no
  imperative `appendChild`, so none of `d3-in-lwc.md`'s manual-DOM
  rules apply.

## Annotated snippet — URL detection + mode switch

```javascript
import { LightningElement, api, track } from 'lwc';

function extractYouTubeId(url) {
    if (!url) return null;
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    if (shortMatch) return shortMatch[1];
    const watchMatch = url.match(/[?&]v=([^?&]+)/);
    if (watchMatch) return watchMatch[1];
    const embedMatch = url.match(/youtube\.com\/embed\/([^?&]+)/);
    if (embedMatch) return embedMatch[1];
    return null;
}

export default class VibeVideo extends LightningElement {
    _videoUrl = ''; _posterUrl = ''; _loop = true; _muted = true;
    _autoplay = true; _controls = false;

    @track _isYouTube = false;
    @track _youTubeId = null;
    _videoReady = false;

    @api get videoUrl() { return this._videoUrl; }
    set videoUrl(v) {
        this._videoUrl = v || '';
        const ytId = extractYouTubeId(this._videoUrl);
        this._isYouTube = !!ytId;
        this._youTubeId = ytId;
        this._videoReady = false;   // force re-apply after DOM branch switches
        this._applyToVideo();
    }

    @api get posterUrl() { return this._posterUrl; }
    set posterUrl(v) { this._posterUrl = v || ''; this._applyToVideo(); }
    @api get loop() { return this._loop; }
    set loop(v) { this._loop = v === true || v === 'true'; this._applyToVideo(); }
    @api get muted() { return this._muted; }
    set muted(v) { this._muted = v === true || v === 'true'; this._applyToVideo(); }
    @api get autoplay() { return this._autoplay; }
    set autoplay(v) { this._autoplay = v === true || v === 'true'; this._applyToVideo(); }
    @api get controls() { return this._controls; }
    set controls(v) { this._controls = v === true || v === 'true'; this._applyToVideo(); }

    get iframeSrc() {
        if (!this._youTubeId) return '';
        const p = new URLSearchParams();
        if (this._autoplay) p.set('autoplay', '1');
        if (this._loop) { p.set('loop', '1'); p.set('playlist', this._youTubeId); }
        if (this._muted) p.set('mute', '1');
        if (!this._controls) p.set('controls', '0');
        p.set('rel', '0'); p.set('modestbranding', '1');
        return `https://www.youtube.com/embed/${this._youTubeId}?${p.toString()}`;
    }

    get isNativeVideo() { return !this._isYouTube; }

    renderedCallback() {
        if (!this._videoReady) { this._videoReady = true; this._applyToVideo(); }
    }

    _applyToVideo() {
        if (this._isYouTube) return;   // YouTube is fully declarative via iframeSrc
        const video = this.template.querySelector('video');
        if (!video) return;
        const source = video.querySelector('source');
        if (source && source.getAttribute('src') !== this._videoUrl) {
            source.setAttribute('src', this._videoUrl);
            video.load();
        }
        video.poster = this._posterUrl;
        video.loop = this._loop;
        video.muted = this._muted;
        video.controls = this._controls;
        if (this._autoplay && this._videoUrl) {
            video.play().catch(() => { /* blocked unmuted autoplay — expected */ });
        } else if (!this._autoplay) {
            video.pause();
        }
    }
}
```

Template — two mutually exclusive branches, no `lwc:dom="manual"`:

```html
<template>
  <div class="video-root">
    <template if:true={isNativeVideo}>
      <video playsinline preload="none">
        <source src="" type="video/mp4" />
      </video>
    </template>
    <template if:true={_isYouTube}>
      <iframe
        src={iframeSrc}
        title="video player"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    </template>
  </div>
</template>
```

`.js-meta.xml` — property panel, no `@api sdk`:

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>60.0</apiVersion>
    <isExposed>true</isExposed>
    <targets>
        <target>analytics__Dashboard</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="analytics__Dashboard">
            <property name="videoUrl"  type="String"  label="Video URL"     description="Public URL, /resource/name, or any YouTube URL" />
            <property name="posterUrl" type="String"  label="Poster URL"    description="Thumbnail shown before playback (native mode only)" />
            <property name="loop"      type="Boolean" label="Loop"          default="true" />
            <property name="muted"     type="Boolean" label="Muted"         default="true"  description="Required for autoplay in most browsers" />
            <property name="autoplay"  type="Boolean" label="Autoplay"      default="true" />
            <property name="controls"  type="Boolean" label="Show Controls" default="false" />
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

## Common surprises

- **Tile is blank, console shows a CSP violation.** `youtube.com` not
  in CSP Trusted Sites for the org — admin step, not an LWC bug.
- **Video won't autoplay.** `muted` is `false`. Browsers block
  unmuted autoplay unconditionally — set `muted: true` or drop
  autoplay and let the attendee click play.
- **Switching from a YouTube URL to an MP4 URL leaves the old
  `<iframe>` visible for a frame.** Missing `_videoReady = false` in
  the `videoUrl` setter — that's what forces `renderedCallback` to
  re-apply after the template branch flips.
- **`youtu.be` short links don't extract an ID.** Regex only checks
  `watch?v=` — add the `youtu\.be\/` and `embed\/` patterns too (all
  three are in the snippet above).

## See also

- SKILL.md — "Cross-cutting gotchas" for the general `analytics__Dashboard`
  target rules (this pattern is exempt from the SDK-specific gotchas
  since it has no SDK dependency at all).
