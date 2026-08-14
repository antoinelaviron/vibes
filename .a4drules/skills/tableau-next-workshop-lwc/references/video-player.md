# video-player - Safe media-only dashboard tile

This is the one workshop pattern with no SDM query, Apex call, or `@api sdk`.
It uses dashboard properties for media settings and must target
`analytics__Dashboard` with API version `66.0`.

## URL Policy

Accept only:

- Exact YouTube hosts: `youtu.be`, `youtube.com`, and `www.youtube.com`.
  A `/watch` URL may contain exactly one `v` parameter with a valid ID and no
  fragment; short and embed forms allow neither query nor fragment.
- Credential-free absolute `https:` URLs without query strings or fragments for
  native media and posters.
- Same-origin `/resource/` paths for native media and posters.

Reject `http:`, `javascript:`, `data:`, `blob:`, credential-bearing, malformed,
or unsupported URLs before assigning a `source.src` or `video.poster`. Native
media and poster URLs must have no query or fragment. Parse URLs; do not use a
generic `?v=` regex that misclassifies unrelated sites. This workshop pattern
intentionally does not accept signed external media URLs because their query
tokens would become dashboard settings.

```javascript
const YOUTUBE_HOSTS = new Set(['youtu.be', 'youtube.com', 'www.youtube.com']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function extractYouTubeId(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || !YOUTUBE_HOSTS.has(url.hostname)) return null;
        let id = null;
        if (url.hash) return null;
        if (url.hostname === 'youtu.be' && /^\/[^/]+\/?$/.test(url.pathname) && !url.search) id = url.pathname.slice(1);
        if (
            (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
            url.pathname === '/watch' &&
            [...url.searchParams.keys()].length === 1 &&
            url.searchParams.has('v')
        ) id = url.searchParams.get('v');
        if (
            (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') &&
            /^\/embed\/[^/]+\/?$/.test(url.pathname) &&
            !url.search
        ) id = url.pathname.split('/')[2];
        return YOUTUBE_ID.test(id || '') ? id : null;
    } catch {
        return null;
    }
}

function safeNativeUrl(value) {
    if (!value) return '';
    if (value.startsWith('/resource/') && !value.includes('?') && !value.includes('#')) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
            ? url.href
            : '';
    } catch {
        return '';
    }
}
```

Rebuild YouTube URLs using the fixed `https://www.youtube.com/embed/<id>` origin.
Do not reuse untrusted query parameters.

## Autoplay And Controls

Muted autoplay is the only reasonable default. If native `video.play()` rejects,
show controls and a named `Play video` action plus a polite status message; do
not swallow the rejection. If autoplay succeeds while controls are hidden,
still provide an operable pause action for moving content.

```html
<template lwc:if={playbackBlocked}>
  <p role="status">Autoplay was blocked. Use Play video to start playback.</p>
  <lightning-button label="Play video" onclick={handlePlay}></lightning-button>
</template>
<template lwc:if={showPauseAction}>
  <lightning-button label="Pause video" onclick={handlePause}></lightning-button>
</template>
```

YouTube embedding also requires the org to trust `https://www.youtube.com` in
CSP Trusted Sites. That is administrator configuration, not an LWC workaround.

For prerecorded video with audio, provide captions. Native video should expose
a configured `<track kind="captions" srclang="en" ...>` when an English WebVTT
file is available; otherwise state that captions are unavailable rather than
claiming the media is fully accessible. Do not treat YouTube's optional
platform-generated captions as a substitute for authored captions.

Use `referrerpolicy="no-referrer"` on the native `<video>` and YouTube
`<iframe>` elements. It limits dashboard-origin disclosure when a user-configured
external media host is loaded.

## Metadata Properties

Expose `videoUrl`, `posterUrl`, `captionUrl`, `loop`, `muted`, `autoplay`, and
`controls`. `captionUrl` must pass the native URL policy and identify a WebVTT
caption file. Describe `videoUrl` as "HTTPS media URL, /resource/ path, or
supported YouTube URL" rather than "any YouTube URL". Never expose an `sdk`
property.
