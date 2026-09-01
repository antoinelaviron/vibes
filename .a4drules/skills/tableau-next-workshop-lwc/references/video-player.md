# Safe media-only dashboard tile

Use this API 67 pattern for an independent media tile. It has no semantic-model
query, discovery, Apex call, or `@api sdk`. Dashboard properties drive validated
media state through setters; do not combine this component with a data-backed
extension.

## Contents

- [URL policy](#url-policy)
- [Setter-driven application](#setter-driven-application)
- [Autoplay and controls](#autoplay-and-controls)
- [Captions](#captions)
- [Template](#template)
- [Metadata](#metadata)
- [Verification](#verification)

## URL policy

Accept only:

- Exact YouTube hosts `youtu.be`, `youtube.com`, and `www.youtube.com` over
  `https:` with no credentials or custom port. A `/watch` URL may contain
  exactly one `v` parameter with a valid ID and no fragment. Short and embed
  forms allow no query or fragment.
- Credential-free absolute `https:` URLs with no query string or fragment for
  native media, posters, and captions.
- Same-origin paths beginning with `/resource/`, with no query or fragment, for
  native media, posters, and captions.

Reject `http:`, protocol-relative, `javascript:`, `data:`, `blob:`, malformed,
credential-bearing, query-bearing, fragment-bearing, and unsupported URLs
before assigning `source.src`, `track.src`, or `video.poster`. This workshop
pattern intentionally rejects signed external media URLs because their query
credentials would become persisted dashboard settings.

Parse the complete URL. Do not use a generic `?v=` regular expression, which
can misclassify unrelated hosts.

```javascript
const YOUTUBE_HOSTS = new Set(['youtu.be', 'youtube.com', 'www.youtube.com']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function extractYouTubeId(value) {
    try {
        const url = new URL(value);
        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.port ||
            url.hash ||
            !YOUTUBE_HOSTS.has(url.hostname)
        ) return null;

        let id = null;
        if (
            url.hostname === 'youtu.be' &&
            /^\/[^/]+\/?$/.test(url.pathname) &&
            !url.search
        ) {
            id = url.pathname.split('/')[1];
        }
        if (
            (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
            url.pathname === '/watch' &&
            [...url.searchParams.keys()].length === 1 &&
            url.searchParams.has('v')
        ) {
            id = url.searchParams.get('v');
        }
        if (
            (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
            /^\/embed\/[^/]+\/?$/.test(url.pathname) &&
            !url.search
        ) {
            id = url.pathname.split('/')[2];
        }
        return YOUTUBE_ID.test(id || '') ? id : null;
    } catch {
        return null;
    }
}

function safeNativeUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    if (value.startsWith('/resource/')) {
        try {
            const url = new URL(value, window.location.origin);
            return url.origin === window.location.origin &&
                url.pathname.startsWith('/resource/') &&
                !url.search &&
                !url.hash
                ? url.pathname
                : '';
        } catch {
            return '';
        }
    }
    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.port &&
            !url.search &&
            !url.hash
            ? url.href
            : '';
    } catch {
        return '';
    }
}

function safeCaptionUrl(value) {
    const url = safeNativeUrl(value);
    if (!url) return '';
    const pathname = new URL(url, window.location.origin).pathname;
    return pathname.toLowerCase().endsWith('.vtt') ? url : '';
}
```

After extraction, reconstruct every embed from the fixed origin
`https://www.youtube.com/embed/<id>`. Build only known playback options from
validated Boolean properties. Never reuse the submitted host, path, query, or
fragment:

```javascript
function youtubeEmbedUrl(id, { autoplay, muted, loop }) {
    if (!YOUTUBE_ID.test(id || '')) return '';
    const url = new URL(`https://www.youtube.com/embed/${id}`);
    url.searchParams.set('controls', '1');
    url.searchParams.set('autoplay', autoplay ? '1' : '0');
    url.searchParams.set('mute', muted ? '1' : '0');
    if (loop) {
        url.searchParams.set('loop', '1');
        url.searchParams.set('playlist', id);
    }
    return url.href;
}
```

YouTube controls remain visible even when the dashboard's native `controls`
setting is false. Cross-origin iframe playback cannot provide reliable custom
play/pause recovery without adding the YouTube player API, so built-in controls
are the media-only safety path.

## Setter-driven application

Expose private-backed `@api` accessors. The `videoUrl` setter classifies a
validated URL as YouTube or native; the poster and caption setters retain only
safe native URLs. Every setter schedules the same DOM application microtask.

```javascript
_playbackToken = 0;
_connected = false;

connectedCallback() {
    this._connected = true;
    this._scheduleApply();
}

disconnectedCallback() {
    this._connected = false;
    this._playbackToken += 1;
    this.template.querySelector('video')?.pause();
    this._appliedVideoElement = null;
}

@api
get videoUrl() { return this._videoUrl; }
set videoUrl(value) {
    this._playbackToken += 1;
    this._videoUrl = value;
    this._youtubeId = extractYouTubeId(value);
    this._nativeVideoUrl = this._youtubeId ? '' : safeNativeUrl(value);
    this._urlInvalid = Boolean(value) && !this._youtubeId && !this._nativeVideoUrl;
    this._autoplayPending = true;
    this._scheduleApply();
}

@api
get posterUrl() { return this._posterUrl; }
set posterUrl(value) {
    this._posterUrl = safeNativeUrl(value);
    this._scheduleApply();
}

@api
get captionUrl() { return this._captionUrl; }
set captionUrl(value) {
    this._captionUrl = safeCaptionUrl(value);
    this._scheduleApply();
}

get youtubeSrc() {
    return youtubeEmbedUrl(this._youtubeId, {
        autoplay: this.autoplay,
        muted: this.muted,
        loop: this.loop
    });
}

get isYouTube() { return Boolean(this._youtubeId); }
get isNativeVideo() { return Boolean(this._nativeVideoUrl); }
get urlInvalid() { return this._urlInvalid; }
get hasCaptions() { return Boolean(this._captionUrl); }
get captionsUnavailable() {
    return this.isNativeVideo && !this.hasCaptions;
}

_scheduleApply() {
    if (this._applyScheduled) return;
    this._applyScheduled = true;
    Promise.resolve().then(() => {
        this._applyScheduled = false;
        if (!this._connected) return;
        this._applyNativeVideo();
    });
}

renderedCallback() {
    // Materialize a newly selected native branch; this component never queries.
    this._scheduleApply();
}
```

The connection guard prevents an already queued application microtask or
`play()` promise from updating a detached component. Keep the token checks and
require both `_connected` and `video.isConnected` before applying playback
results.

Generate the same accessor shape for `loop`, `muted`, `autoplay`, and
`controls`. Setters store Booleans and call `_scheduleApply()`; setters that can
affect playback increment `_playbackToken`, and the `autoplay` setter also sets
`_autoplayPending = true` when enabled. Increment the token during disconnect as
well. Reapply those values as DOM properties after every property-panel edit.
Reassign the source and call `video.load()` only when the validated native media
URL or mounted video element changes.

```javascript
_applyNativeVideo() {
    const video = this.template.querySelector('video');
    if (!this._connected || !video?.isConnected) return;

    video.loop = this.loop;
    video.muted = this.muted;
    video.autoplay = this.autoplay;
    video.controls = this.controls || this.playbackBlocked;

    if (this._posterUrl) video.poster = this._posterUrl;
    else video.removeAttribute('poster');

    const source = video.querySelector('source');
    const track = video.querySelector('track');
    if (
        this._appliedVideoElement !== video ||
        this._appliedVideoUrl !== this._nativeVideoUrl
    ) {
        this._appliedVideoElement = video;
        this._appliedVideoUrl = this._nativeVideoUrl;
        if (this._nativeVideoUrl) source.src = this._nativeVideoUrl;
        else source.removeAttribute('src');
        video.load();
    }
    if (track && this._captionUrl) track.src = this._captionUrl;

    if (this._autoplayPending) {
        this._autoplayPending = false;
        if (this.autoplay && this._nativeVideoUrl) this._attemptPlay(video);
    }
}
```

Do not use `lwc:dom="manual"`. The template owns the media elements; the only
imperative work is safe property application and playback control.

## Autoplay and controls

Muted autoplay is the only reasonable default. Default `muted` to `true`. If
sound is required, use `autoplay: false` and visible controls so the user starts
playback.

For native video, handle the `video.play()` promise. A rejection must expose a
visible status, native controls, and a named `Play video` action. If autoplay
succeeds while native controls are hidden, retain an operable `Pause video`
action so moving content can be stopped.

```javascript
async _attemptPlay(video) {
    const token = ++this._playbackToken;
    const source = this._nativeVideoUrl;
    try {
        await video.play();
        if (
            !this._connected ||
            !video.isConnected ||
            token !== this._playbackToken ||
            video !== this._appliedVideoElement ||
            source !== this._nativeVideoUrl
        ) return;
        this.playbackBlocked = false;
        this.isPlaying = true;
    } catch {
        if (
            !this._connected ||
            !video.isConnected ||
            token !== this._playbackToken ||
            video !== this._appliedVideoElement ||
            source !== this._nativeVideoUrl
        ) return;
        this.playbackBlocked = true;
        this.isPlaying = false;
        video.controls = true;
    }
}

handlePlay() {
    const video = this.template.querySelector('video');
    if (video) this._attemptPlay(video);
}

handlePause() {
    this._playbackToken += 1;
    this.template.querySelector('video')?.pause();
}

handlePlaying() {
    this.playbackBlocked = false;
    this.isPlaying = true;
}

handlePaused() {
    this.isPlaying = false;
}

get showPauseAction() {
    return this.isPlaying && !this.controls;
}
```

## Captions

For prerecorded native video with speech or meaningful audio, configure
`captionUrl` with an authored English WebVTT (`.vtt`) file and expose
`<track kind="captions" srclang="en" label="English" default>`. If no caption
file exists, state that captions are unavailable rather than describing the
media as fully accessible.

For YouTube, select a video with authored captions. Optional platform-generated
captions are not a substitute for reviewed captions, and `captionUrl` applies
only to native video.

## Template

Bind the iframe only to the fixed-origin `youtubeSrc` getter. Native source,
poster, and track values are applied by the validated setters above, never by
binding raw dashboard strings.

```html
<template>
  <template lwc:if={isYouTube}>
    <iframe
      src={youtubeSrc}
      title="Video player"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </template>
  <template lwc:elseif={isNativeVideo}>
    <video referrerpolicy="no-referrer" onplay={handlePlaying} onpause={handlePaused}>
      <source />
      <template lwc:if={hasCaptions}>
        <track kind="captions" srclang="en" label="English" default />
      </template>
    </video>
    <template lwc:if={captionsUnavailable}>
      <p role="status">Captions are unavailable for this video.</p>
    </template>
    <template lwc:if={playbackBlocked}>
      <p role="status">Autoplay was blocked. Use Play video to start playback.</p>
      <lightning-button label="Play video" onclick={handlePlay}></lightning-button>
    </template>
    <template lwc:if={showPauseAction}>
      <lightning-button label="Pause video" onclick={handlePause}></lightning-button>
    </template>
  </template>
  <template lwc:elseif={urlInvalid}>
    <p role="alert">Enter a supported HTTPS media, static resource, or YouTube URL.</p>
  </template>
</template>
```

Use `referrerpolicy="no-referrer"` on native `<video>`. YouTube requires an
HTTP Referer for embedded-player identity, so use its recommended
`strict-origin-when-cross-origin` policy on the iframe rather than suppressing
the header.

YouTube embedding also requires the org to trust `https://www.youtube.com` in
CSP Trusted Sites. Report a CSP failure as administrator configuration, not as
an LWC workaround. A same-origin `/resource/` native video remains the offline
fallback.

## Metadata

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>67.0</apiVersion>
    <isExposed>true</isExposed>
    <targets>
        <target>analytics__Dashboard</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="analytics__Dashboard">
            <property name="videoUrl" type="String" label="Video URL"
                description="HTTPS media URL, /resource/ path, or supported YouTube URL" />
            <property name="posterUrl" type="String" label="Poster URL"
                description="HTTPS image URL or /resource/ path for native video" />
            <property name="captionUrl" type="String" label="English Captions"
                description="HTTPS or /resource/ URL for an authored WebVTT (.vtt) file" />
            <property name="loop" type="Boolean" label="Loop" default="true" />
            <property name="muted" type="Boolean" label="Muted" default="true"
                description="Required for autoplay in most browsers" />
            <property name="autoplay" type="Boolean" label="Autoplay" default="true" />
            <property name="controls" type="Boolean" label="Show Native Controls" default="false" />
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

Never expose an `sdk` property.

## Verification

1. The bundle targets `analytics__Dashboard` at API `67.0` and contains no SDK,
   discovery, query, or Apex path.
2. Supported YouTube forms produce only a fixed-origin embed URL; lookalike
   hosts, extra parameters, fragments, credentials, ports, and invalid IDs fail
   closed.
3. Native video, poster, and caption values accept only the documented HTTPS or
   same-origin `/resource/` forms and are validated before DOM assignment.
4. Every property setter schedules DOM application; a source change calls
   `video.load()` once and reapplies Boolean DOM properties.
5. Blocked native autoplay exposes visible status, controls, and a Play action;
   hidden controls never leave autoplaying media without a Pause action.
6. Native prerecorded speech has an authored WebVTT track, or the caption gap is
   explicitly disclosed. YouTube content has reviewed authored captions.
7. Native video uses `no-referrer`; YouTube uses
   `strict-origin-when-cross-origin`; YouTube CSP configuration is verified
   separately.
8. A stale `play()` resolution or rejection cannot update state after a source,
   playback property, or connection change.
