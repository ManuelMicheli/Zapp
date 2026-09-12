# Zapp Mobile (app nativa iOS/Android)

Guscio Expo (repo separato `D:\PROGETTI\ZappMobile`, bundle `com.zapp.mobile`, scheme `zapp`)
che carica il sito in WebView e aggiunge moduli nativi. Design e piano:
`docs/superpowers/specs/2026-09-12-zapp-mobile-design.md`.

## Ponte web ↔ nativo

Protocollo JSON su `window.ReactNativeWebView.postMessage` (web→nativo) e `webViewRef.injectJavaScript` → `window.dispatchEvent(new CustomEvent('zapp:native', {detail}))` (nativo→web). Il nativo si dichiara con user-agent suffisso ` ZappMobile/<versione> (<ios|android>)` e con `window.ZappNative = { platform, version }` iniettato prima del load.

| Direzione | Tipo | Payload | Chi lo tratta |
|---|---|---|---|
| nativo→web | `ready` | `{platform, version, installId}` | `src/lib/native/bridge.ts` |
| nativo→web | `pushToken` | `{token}` | fase 1 |
| nativo→web | `sharedContent` | `{url?, text?}` | fase 2: naviga a `/share/incoming` |
| nativo→web | `deepLink` | `{path}` | naviga |
| web→nativo | `deviceToken` | `{token, deviceId}` | SecureStore |
| web→nativo | `openExternal` | `{url}` | `Linking.openURL` |
| web→nativo | `badge` | `{count}` | `Notifications.setBadgeCountAsync` |
| web→nativo | `signedOut` | `{}` | cancella SecureStore, chiama `DELETE /api/devices/self` |

## Una sola autenticazione

La WebView tiene i cookie Supabase. Al primo `ready` con utente loggato, la web chiama la Server Action `pairOwnDevice({platform, installId, name})` → riga in `devices` (enum + `'ios'`) e `device_members`, token restituito una volta → `deviceToken` al nativo → SecureStore. Ogni chiamata nativa senza WebView usa `Authorization: Bearer <token>`: `/api/scrobble`, `/api/devices/push-token`, `/api/devices/intent`, `/api/devices/self`. Revoca da `/devices` (già esistente). `install_id` è la chiave di idempotenza: stesso installId → stesso device (nuovo token, vecchio hash sostituito).

## Trappole

Nessuna ancora: si riempie fase per fase.
