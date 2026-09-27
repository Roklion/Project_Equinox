# Installable app validation

Equinox's EPIC 1 installed experience is online-only. The app manifest and icons support home-screen installation; there is no service worker, background sync, or offline portfolio storage. Financial pages will require a live session and connection when they are introduced. See [architecture](architecture.md) for the cache boundary and [design system](design-system.md) for responsive behavior.

## Local desktop checks

1. Run `npm ci`, then `npm run dev`, and open `http://localhost:3000` in a Chromium browser. `localhost` is a secure context for local browser testing.
2. In browser developer tools, inspect the Application > Manifest panel. Confirm the Equinox name, 192px and 512px icons, `/` start URL, and standalone display mode. Confirm `/manifest.webmanifest`, `/icon-192.png`, and `/icon-512.png` load successfully.
3. Install Equinox through the browser's install action where offered. Open the installed window while online, reload the overview, and use the Equinox header link to return to `/`. The shell should fill the app window without browser page chrome.
4. In responsive device mode, check a 390px wide iPhone viewport and a 1280px desktop viewport. The heading, empty state, header link, and footer should remain readable, reachable, and free of horizontal scrolling.
5. In Application > Service Workers and Storage, confirm this app registered no service worker and created no offline financial-data cache. Disconnect the network and confirm the app does not claim that portfolio information remains available offline.

## iPhone home-screen checks

Use a deployed HTTPS URL reachable by the device. A plain LAN HTTP address does not meet the secure-context requirement for reliable install testing.

1. Open the site in Safari, choose Share > Add to Home Screen, and verify the Equinox name and icon.
2. Launch from the home-screen icon while online. Confirm it opens in standalone presentation, the top and bottom safe areas are respected, and the overview fits portrait width without horizontal scrolling.
3. Reload and use the Equinox header link. Both should reach the live site. Repeat after a network interruption and reconnection; the app should recover through normal online loading rather than show cached financial content.

Installation support and browser UI vary by platform. These device checks require a real browser or device and are separate from the repository's automated checks.
