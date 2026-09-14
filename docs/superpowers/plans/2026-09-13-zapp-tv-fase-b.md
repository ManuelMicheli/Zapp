# Zapp TV — Fase B (app Android TV / Fire TV) — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'app Zapp TV per Fire TV / Android TV in `D:\PROGETTI\ZappTV\android`: abbinamento con sessione, Home con carosello e scaffali, Scheda con Play che apre la piattaforma, Stagione, Ricerca, Libreria, Impostazioni, piu' l'ascolto di ZConnection (listener, sonda, invio eventi, comandi dal telefono) portato dal repo `D:\PROGETTI\ZConnection`.

**Architecture:** Un'Activity sola con Compose for TV e `NavHost`; ogni schermata ha il suo `ViewModel` che parla con `ZappApi` (bearer utente + `X-Zapp-Device`, rinnovo automatico su 401, disconnessione su 410) e con `DeviceApi` (token dispositivo: abbinamento, scrobble, comandi). I moduli di ascolto di ZConnection (`ZListener`, `SessionProbe`, `Sender`, `Comandi`) si copiano tali e quali con il package nuovo: sono logica misurata sull'hardware, non si "ripulisce". I DTO Kotlin sono la copia a mano di `src/lib/tv/dto.ts` di Zapp (commit di riferimento in testa al file).

**Tech Stack:** Kotlin 2.0.20, AGP 8.5.2, Gradle 8.10.2 (wrapper copiato da ZConnection), Compose BOM 2024.09.03 + plugin `org.jetbrains.kotlin.plugin.compose`, `androidx.tv:tv-material:1.0.0`, Navigation Compose 2.8.1, Coil 2.7.0, OkHttp 4.12.0 (+ MockWebServer nei test), kotlinx-serialization 1.7.3, `androidx.security:security-crypto:1.1.0-alpha06`, JUnit 4. `minSdk 25` (Fire OS 6), `compileSdk/targetSdk 34`, JDK 17 Temurin.

**Spec:** `docs/superpowers/specs/2026-09-12-zapp-tv-design.md` (§3, §4, §5.4, §6, §11, §12). Contratto: `src/lib/tv/dto.ts` e `docs/architecture/tv.md` del repo Zapp (`origin/main` 6d793c3).

## Global Constraints

- Repo nuovo `D:\PROGETTI\ZappTV` (git init nel Task 1), progetto Android in `android/`. **Non toccare** `D:\PROGETTI\Zapp` (se serve leggere `dto.ts` o `tv.md`, leggerli da `D:\PROGETTI\Zapp\.claude\worktrees\tv-api`, in sola lettura) ne' `D:\PROGETTI\ZConnection` (sola lettura: e' l'archivio da cui si copia).
- Toolchain PC (Windows, niente Android Studio): `JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot"`, SDK in `%LOCALAPPDATA%\Android\Sdk` (`sdk.dir` in `local.properties`, mai committato), AVG intercetta TLS: `gradle.properties` porta `-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` (copiare da ZConnection). **`./gradlew` vuole rete: lanciarlo con la sandbox disabilitata** (`dangerouslyDisableSandbox: true`) e `--no-daemon`. Prima build lenta (scarica Compose): timeout 10 minuti.
- Package `com.zapp.tv`, `applicationId com.zapp.tv`, `versionCode 1`, `versionName "0.1-fase-b"`. Commenti e testi UI in italiano. Nomi di classe/funzione in italiano dove ZConnection lo fa gia' (`Sender`, `Comandi`, `Stato`), inglese per i DTO (copia di `dto.ts`).
- Contratto: `api/Dto.kt` e' la copia campo per campo di `dto.ts` (stessi nomi, stessa nullabilita'; `ignoreUnknownKeys = true`; mai un campo in piu' che il server non manda). In testa al file: `// Copia di src/lib/tv/dto.ts di Zapp @ 6d793c3`.
- Server: base `https://zapp-mu.vercel.app`; in debug `BuildConfig.BASE_DEBUG` da `-PzappBase=http://<ip-pc>:<porta>` (vuoto = server vero) e `usesCleartextTraffic` solo nel manifest di debug. Immagini: `https://image.tmdb.org/t/p/{w342|w780|original}{path}`, loghi `w92`.
- Autenticazione: `/api/tv/v1/*` con `Authorization: Bearer <accessToken>` **e** `X-Zapp-Device: <deviceId>`; rinnovo con `POST /api/tv/v1/auth/refresh` `{refresh_token}` quando mancano < 5 min o su 401 (una volta, poi disconnessione); `410` = dispositivo revocato → cancella tutto e torna al codice. Abbinamento, scrobble e comandi con `Authorization: Bearer <deviceToken>` (token generato dalla TV, il server vede l'hash). Regole 401×3 / 403 di ZConnection invariate.
- Deposito: `EncryptedSharedPreferences` (`AndroidX security-crypto`) per token e sessione; chiavi `install_id`, `token`, `device_id`, `access_token`, `refresh_token`, `expires_at`, `user_id`, `username`, `base_url`.
- UI 10 piedi: testi ≥ 24 sp, tessera a fuoco scala 1,08 con bordo bianco, barra laterale a sinistra (Home, Cerca, Libreria, Impostazioni), Indietro dalla barra chiude l'app. Palette del sito: `bg #000000`, `surface #0e0e12`, `surface2 #1c1c1e`, `border rgba(255,255,255,0.07)`, `text #ffffff`, `muted #8e8e93`, `accent #8b5cf6`, `accentStrong #7c3aed`, `accentSoft #a78bfa`, `danger #f87171`. Font Inter (TTF statici in `res/font`).
- Test: JUnit 4 sui puri (`app/src/test`), MockWebServer per i client HTTP. Niente strumentati (nessun emulatore). Ogni task: `./gradlew --no-daemon :app:testDebugUnitTest` verde e `./gradlew --no-daemon :app:assembleDebug` che compila. Collaudo vero solo nel Task 15 sulla Fire TV.
- Commit: conventional, in italiano, chiusi da
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DXbqL8e8bgvC4Vm31ePT4a
  ```
- Non copiare in Zapp TV: `Ui.kt`, `PairingActivity`, `ConnectedActivity`, `PermissionActivity` di ZConnection (UI a View, si riscrive in Compose).

---

### Task 1: Repo, progetto Gradle, prima build

**Files:**
- Create: `D:\PROGETTI\ZappTV\.gitignore`, `LEGGIMI.md`
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/gradle/wrapper/*` (copiati da `D:\PROGETTI\ZConnection\gradle\wrapper\`), `android/gradlew`, `android/gradlew.bat`
- Create: `android/app/build.gradle.kts`, `android/app/proguard-rules.pro`
- Create: `android/app/src/main/AndroidManifest.xml`, `android/app/src/debug/AndroidManifest.xml`
- Create: `android/app/src/main/res/values/strings.xml`, `res/drawable/banner.xml` (copiato da ZConnection), `res/values/themes.xml`
- Create: `android/app/src/main/java/com/zapp/tv/MainActivity.kt`

**Interfaces:**
- Produces: modulo `:app` che compila con Compose for TV; `BuildConfig.BASE_DEBUG: String`; `MainActivity` che mostra "Zapp TV".

- [ ] **Step 1: Repo e ignore**

```bash
mkdir -p /d/PROGETTI/ZappTV/android && cd /d/PROGETTI/ZappTV && git init -q -b main
```

`.gitignore`:
```
android/.gradle/
android/build/
android/app/build/
android/local.properties
android/.idea/
*.apk
*.aab
*.keystore
.DS_Store
```

`LEGGIMI.md` (10 righe): cos'e' (app TV di Zapp, contratto in `src/lib/tv/dto.ts` di Zapp), come si compila (`JAVA_HOME`, `./gradlew --no-daemon :app:assembleDebug`), come si punta a un'istanza locale (`-PzappBase=`), dove sta la spec (`docs/superpowers/specs/2026-09-12-zapp-tv-design.md` nel repo Zapp).

- [ ] **Step 2: Wrapper e proprieta'**

Copiare `gradle/wrapper/gradle-wrapper.jar`, `gradle-wrapper.properties` (Gradle 8.10.2), `gradlew`, `gradlew.bat` da ZConnection. `android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx3g -Djavax.net.ssl.trustStoreType=WINDOWS-ROOT
systemProp.javax.net.ssl.trustStoreType=WINDOWS-ROOT
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
```

`android/settings.gradle.kts`:
```kotlin
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories { google(); mavenCentral() }
}
rootProject.name = "ZappTV"
include(":app")
```

`android/build.gradle.kts`:
```kotlin
plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "2.0.20" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
  id("org.jetbrains.kotlin.plugin.serialization") version "2.0.20" apply false
}
```

- [ ] **Step 3: Modulo app**

`android/app/build.gradle.kts`:
```kotlin
import java.util.Properties

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  id("org.jetbrains.kotlin.plugin.serialization")
}

// Firma di release da local.properties (mai nel repo), come in ZConnection.
val locali = Properties().apply {
  val f = rootProject.file("local.properties"); if (f.exists()) f.inputStream().use { load(it) }
}

android {
  namespace = "com.zapp.tv"
  compileSdk = 34
  defaultConfig {
    applicationId = "com.zapp.tv"
    minSdk = 25 // Fire OS 6 (Android 7.1)
    targetSdk = 34
    versionCode = 1
    versionName = "0.1-fase-b"
    buildConfigField("String", "BASE_DEBUG", "\"\"")
  }
  signingConfigs {
    create("release") {
      val ks = locali.getProperty("zappKeystore")
      if (ks != null) {
        storeFile = file(ks)
        storePassword = locali.getProperty("zappKeystorePassword")
        keyAlias = locali.getProperty("zappKeyAlias")
        keyPassword = locali.getProperty("zappKeystorePassword")
      }
    }
  }
  buildTypes {
    debug {
      // -PzappBase=http://192.168.1.10:3400 per collaudare contro un'istanza in rete locale.
      val base = (project.findProperty("zappBase") as String?) ?: ""
      buildConfigField("String", "BASE_DEBUG", "\"$base\"")
    }
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("release")
    }
  }
  buildFeatures { compose = true; buildConfig = true }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
  testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
  val bom = platform("androidx.compose:compose-bom:2024.09.03")
  implementation(bom)
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.foundation:foundation")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.tv:tv-material:1.0.0")
  implementation("androidx.activity:activity-compose:1.9.2")
  implementation("androidx.navigation:navigation-compose:2.8.1")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
  implementation("io.coil-kt:coil-compose:2.7.0")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
  testImplementation("junit:junit:4.13.2")
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
```

`proguard-rules.pro` vuoto con un commento.

- [ ] **Step 4: Manifest, tema, banner**

`app/src/main/AndroidManifest.xml`:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-feature android:name="android.software.leanback" android:required="false" />
  <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
  <application
    android:label="@string/app_name"
    android:icon="@drawable/banner"
    android:banner="@drawable/banner"
    android:theme="@style/Theme.ZappTv"
    android:supportsRtl="false">
    <activity
      android:name=".MainActivity"
      android:exported="true"
      android:screenOrientation="landscape"
      android:launchMode="singleTask">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
```
(il servizio `ZListener` si aggiunge nel Task 6). `app/src/debug/AndroidManifest.xml`:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <application android:usesCleartextTraffic="true" tools:replace="android:usesCleartextTraffic" />
</manifest>
```
`res/values/themes.xml`: `<style name="Theme.ZappTv" parent="android:Theme.Material.NoActionBar"><item name="android:windowBackground">#000000</item></style>`. `strings.xml`: `app_name` = `Zapp`. `banner.xml` copiato da ZConnection.

- [ ] **Step 5: MainActivity minima**

```kotlin
package com.zapp.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

class MainActivity : ComponentActivity() {
  @OptIn(ExperimentalTvMaterial3Api::class)
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent { MaterialTheme { Text("Zapp TV") } }
  }
}
```

- [ ] **Step 6: Build**

Run (sandbox disabilitata, da `android/`): `JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" ./gradlew --no-daemon :app:assembleDebug`
Expected: `BUILD SUCCESSFUL`, `app/build/outputs/apk/debug/app-debug.apk` presente. Se `local.properties` manca: crearlo con `sdk.dir=C:\\Users\\Manum\\AppData\\Local\\Android\\Sdk` (fuori dal repo per `.gitignore`).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: progetto Android TV con Compose for TV, build di debug"
```

---

### Task 2: Contratto — DTO Kotlin e decodifica

**Files:**
- Create: `android/app/src/main/java/com/zapp/tv/api/Dto.kt`
- Create: `android/app/src/main/java/com/zapp/tv/api/JsonZapp.kt`
- Test: `android/app/src/test/java/com/zapp/tv/api/DtoTest.kt`

**Interfaces:**
- Produces: `@Serializable` data class per ogni interfaccia di `dto.ts` (`TitleCard`, `ContinueCard`, `HeroCard`, `ShelfRef`, `LibraryCard`, `LibraryPage`, `ProviderInfo`, `ProviderOffer`, `UserEntry`, `NextEpisode`, `SeasonSummary`, `CastMember`, `Trailer`, `Palette`, `TitleDetail`, `EpisodeItem`, `SeasonDetail`, `LaunchAndroid`, `LaunchTvos`, `LaunchPlan`, `Session`, `EntrySnapshotDto`, `WatchResult`, `HomeResponse`, `ShelfResponse`, `MeUser`, `MeDevice`, `MeResponse`, `ProvidersResponse`, `SearchResponse`) e `val JsonZapp = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }`.

- [ ] **Step 1: Test di decodifica**

`DtoTest.kt`:
```kotlin
package com.zapp.tv.api

import org.junit.Assert.*
import org.junit.Test

class DtoTest {
  @Test fun `decodifica HomeResponse`() {
    val json = """{"continue":[{"id":1399,"mediaType":"tv","name":"Il Trono di Spade","year":"2011","posterPath":"/p.jpg","backdropPath":null,"zappScore":9.1,"zappVotes":500,"affinity":null,"reason":null,"providerIds":[8],"entryId":"42","episodeLabel":"S1:E4","episodeName":"Storpi","shownSeason":1,"shownEpisode":4,"imageUrl":"https://image.tmdb.org/t/p/original/b.jpg","runtimeLabel":"56 min","progressPct":4,"resumePositionMs":null,"resumeDurationMs":null,"providerId":8,"live":false}],"hero":[{"id":27205,"mediaType":"movie","name":"Inception","year":"2010","posterPath":"/i.jpg","backdropPath":"/ib.jpg","zappScore":null,"zappVotes":0,"affinity":91,"reason":"Per te","providerIds":[],"overview":"Un ladro…"}],"shelves":[{"key":"foryou","title":"Per te","subtitle":null,"layout":"poster"},{"key":"persone|Regia:Denis Villeneuve","title":"Ancora con Denis Villeneuve","subtitle":null,"layout":"poster"}]}"""
    val home = JsonZapp.decodeFromString(HomeResponse.serializer(), json)
    assertEquals(1, home.continue_.size)
    assertEquals("S1:E4", home.continue_[0].episodeLabel)
    assertEquals(91.0, home.hero[0].affinity!!, 0.0)
    assertEquals("persone|Regia:Denis Villeneuve", home.shelves[1].key)
  }

  @Test fun `decodifica TitleDetail con offerte e stagioni`() {
    val json = """{"id":1399,"mediaType":"tv","name":"Il Trono di Spade","year":"2011","posterPath":"/p.jpg","backdropPath":"/b.jpg","zappScore":9.1,"zappVotes":500,"affinity":null,"reason":null,"providerIds":[8,39],"originalName":"Game of Thrones","overview":"Nove famiglie","tagline":"L'inverno sta arrivando","genres":["Dramma"],"runtimeMin":60,"releaseDate":"2011-04-17","tmdbRating":8.4,"cast":[{"name":"Emilia Clarke","character":"Daenerys","profilePath":"/e.jpg"}],"trailer":{"youtubeId":"abc123"},"providers":[{"id":8,"name":"Netflix","logoPath":"/n.jpg","kind":"flatrate","canLaunch":true,"expected":"avvia","url":"https://www.netflix.com/title/70143836"},{"id":39,"name":"NOW","logoPath":null,"kind":"flatrate","canLaunch":false,"expected":null,"url":null}],"entry":{"status":"watching","rating":9,"season":1,"episode":3,"next":{"season":1,"episode":4}},"seasons":[{"number":1,"name":"Stagione 1","episodeCount":10,"airDate":"2011-04-17","posterPath":null,"watched":3}],"similar":[],"palette":{"primary":"#112233","secondary":"#445566"}}"""
    val d = JsonZapp.decodeFromString(TitleDetail.serializer(), json)
    assertEquals("abc123", d.trailer?.youtubeId)
    assertTrue(d.providers[0].canLaunch); assertFalse(d.providers[1].canLaunch)
    assertEquals(4, d.entry?.next?.episode)
    assertEquals(3, d.seasons[0].watched)
    assertEquals("#112233", d.palette?.primary)
  }

  @Test fun `decodifica LaunchPlan, Session, WatchResult, MeResponse`() {
    val plan = JsonZapp.decodeFromString(LaunchPlan.serializer(), """{"commandId":"3b241101-e2bb-4255-8caf-4136c566a962","android":{"packages":["com.netflix.ninja","com.netflix.mediaclient"],"dataUri":null,"extraDeeplink":"70143836"},"tvos":null,"expected":"avvia"}""")
    assertEquals(listOf("com.netflix.ninja", "com.netflix.mediaclient"), plan.android?.packages)
    val s = JsonZapp.decodeFromString(Session.serializer(), """{"accessToken":"a.b.c","refreshToken":"kcz2dgr2c45o","expiresAt":1760000000}""")
    assertEquals(1760000000L, s.expiresAt)
    val w = JsonZapp.decodeFromString(WatchResult.serializer(), """{"ok":true,"error":null,"prev":null,"entry":{"status":"want","rating":null,"seasonNumber":null,"episodeNumber":null,"isPrivate":false,"startedAt":null,"finishedAt":null,"lastWatchedAt":"2026-09-13T10:00:00Z"}}""")
    assertTrue(w.ok); assertEquals("want", w.entry?.status)
    val me = JsonZapp.decodeFromString(MeResponse.serializer(), """{"user":{"id":"u1","username":"manuel","displayName":null,"avatarPath":null},"device":{"id":"d1","name":"Fire TV","platform":"fire_tv","lastSeenAt":null},"listening":false,"tmdbAttribution":"This product uses the TMDB API but is not endorsed or certified by TMDB."}""")
    assertEquals("Fire TV", me.device?.name)
  }

  @Test fun `campi sconosciuti ignorati`() {
    val c = JsonZapp.decodeFromString(TitleCard.serializer(), """{"id":1,"mediaType":"movie","name":"X","year":null,"posterPath":null,"backdropPath":null,"zappScore":null,"zappVotes":0,"affinity":null,"reason":null,"providerIds":[],"nuovoCampo":true}""")
    assertEquals("X", c.name)
  }
}
```

- [ ] **Step 2: Run, deve fallire** — `./gradlew --no-daemon :app:testDebugUnitTest --tests "com.zapp.tv.api.DtoTest"` → errori di compilazione (classi assenti).

- [ ] **Step 3: `Dto.kt`** (estratto: gli altri seguono lo stesso schema, un campo per riga, nullabilita' identica a `dto.ts`)

```kotlin
// Copia di src/lib/tv/dto.ts di Zapp @ 6d793c3. Cambia dto.ts = cambia questo file.
package com.zapp.tv.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class TitleCard(
  val id: Long, val mediaType: String, val name: String, val year: String?,
  val posterPath: String?, val backdropPath: String?, val zappScore: Double?, val zappVotes: Int,
  val affinity: Double?, val reason: String?, val providerIds: List<Int>,
)
@Serializable data class ContinueCard(
  val id: Long, val mediaType: String, val name: String, val year: String?,
  val posterPath: String?, val backdropPath: String?, val zappScore: Double?, val zappVotes: Int,
  val affinity: Double?, val reason: String?, val providerIds: List<Int>,
  val entryId: String, val episodeLabel: String?, val episodeName: String?,
  val shownSeason: Int?, val shownEpisode: Int?, val imageUrl: String?, val runtimeLabel: String?,
  val progressPct: Double?, val resumePositionMs: Long?, val resumeDurationMs: Long?,
  val providerId: Int?, val live: Boolean,
)
@Serializable data class HeroCard(
  val id: Long, val mediaType: String, val name: String, val year: String?,
  val posterPath: String?, val backdropPath: String?, val zappScore: Double?, val zappVotes: Int,
  val affinity: Double?, val reason: String?, val providerIds: List<Int>, val overview: String?,
)
@Serializable data class ShelfRef(val key: String, val title: String, val subtitle: String?, val layout: String)
@Serializable data class LibraryCard(
  val id: Long, val mediaType: String, val name: String, val year: String?,
  val posterPath: String?, val backdropPath: String?, val zappScore: Double?, val zappVotes: Int,
  val affinity: Double?, val reason: String?, val providerIds: List<Int>,
  val status: String, val rating: Int?,
)
@Serializable data class LibraryPage(val items: List<LibraryCard>, val total: Int)
@Serializable data class ProviderInfo(val id: Int, val name: String, val logoPath: String?)
@Serializable data class ProviderOffer(
  val id: Int, val name: String, val logoPath: String?, val kind: String,
  val canLaunch: Boolean, val expected: String?, val url: String?,
)
@Serializable data class NextEpisode(val season: Int, val episode: Int)
@Serializable data class UserEntry(val status: String, val rating: Int?, val season: Int?, val episode: Int?, val next: NextEpisode?)
@Serializable data class SeasonSummary(val number: Int, val name: String, val episodeCount: Int, val airDate: String?, val posterPath: String?, val watched: Int)
@Serializable data class CastMember(val name: String, val character: String?, val profilePath: String?)
@Serializable data class Trailer(val youtubeId: String)
@Serializable data class Palette(val primary: String, val secondary: String)
@Serializable data class TitleDetail(
  val id: Long, val mediaType: String, val name: String, val year: String?,
  val posterPath: String?, val backdropPath: String?, val zappScore: Double?, val zappVotes: Int,
  val affinity: Double?, val reason: String?, val providerIds: List<Int>,
  val originalName: String?, val overview: String?, val tagline: String?, val genres: List<String>,
  val runtimeMin: Int?, val releaseDate: String?, val tmdbRating: Double?, val cast: List<CastMember>,
  val trailer: Trailer?, val providers: List<ProviderOffer>, val entry: UserEntry?,
  val seasons: List<SeasonSummary>, val similar: List<TitleCard>, val palette: Palette?,
)
@Serializable data class EpisodeItem(val number: Int, val name: String, val overview: String?, val stillPath: String?, val airDate: String?, val runtimeMin: Int?, val watched: Boolean, val resumeMs: Long?)
@Serializable data class SeasonDetail(val number: Int, val name: String, val overview: String?, val episodes: List<EpisodeItem>)
@Serializable data class LaunchAndroid(val packages: List<String>, val dataUri: String?, val extraDeeplink: String?)
@Serializable data class LaunchTvos(val url: String)
@Serializable data class LaunchPlan(val commandId: String, val android: LaunchAndroid?, val tvos: LaunchTvos?, val expected: String)
@Serializable data class Session(val accessToken: String, val refreshToken: String, val expiresAt: Long)
@Serializable data class EntrySnapshotDto(val status: String, val rating: Int?, val seasonNumber: Int?, val episodeNumber: Int?, val isPrivate: Boolean, val startedAt: String?, val finishedAt: String?, val lastWatchedAt: String?)
@Serializable data class WatchResult(val ok: Boolean, val error: String?, val prev: EntrySnapshotDto?, val entry: EntrySnapshotDto?)
@Serializable data class HomeResponse(@SerialName("continue") val continue_: List<ContinueCard>, val hero: List<HeroCard>, val shelves: List<ShelfRef>)
@Serializable data class ShelfResponse(val key: String, val items: List<TitleCard>)
@Serializable data class MeUser(val id: String, val username: String?, val displayName: String?, val avatarPath: String?)
@Serializable data class MeDevice(val id: String, val name: String, val platform: String, val lastSeenAt: String?)
@Serializable data class MeResponse(val user: MeUser, val device: MeDevice?, val listening: Boolean, val tmdbAttribution: String)
@Serializable data class ProvidersResponse(val providers: List<ProviderInfo>)
@Serializable data class SearchResponse(val results: List<TitleCard>)
```

`JsonZapp.kt`:
```kotlin
package com.zapp.tv.api
import kotlinx.serialization.json.Json
/** Il server puo' aggiungere campi: la TV non deve rompersi per un campo in piu'. */
val JsonZapp = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
```

- [ ] **Step 4: Run, deve passare** — stesso comando, 4 test verdi.
- [ ] **Step 5: Commit** — `feat(api): DTO Kotlin copiati da dto.ts, decodifica tollerante`

---

### Task 3: Deposito cifrato e regola di rinnovo

**Files:**
- Create: `android/app/src/main/java/com/zapp/tv/store/Store.kt`
- Create: `android/app/src/main/java/com/zapp/tv/store/SessionPolicy.kt`
- Test: `android/app/src/test/java/com/zapp/tv/store/SessionPolicyTest.kt`

**Interfaces:**
- Produces: `class Store(context: Context)` con `installId: String` (uuid generato una volta), `deviceToken: String` (`zc_` + 32 byte base64url, generato una volta), `tokenHash(): String` (SHA-256 hex), `deviceId: String?`, `session: Session?`, `userId: String?`, `username: String?`, `baseUrl: String`, `salvaAbbinamento(deviceId, session, user: MeUser?)`, `salvaSessione(session)`, `dimentica()` (cancella tutto tranne `base_url`), `nome: String` (= `Build.MODEL`). `object SessionPolicy { const val MARGINE_S = 300; fun vaRinnovata(expiresAt: Long, nowS: Long): Boolean }`.

- [ ] **Step 1: Test** (`SessionPolicyTest.kt`): `vaRinnovata(1000, 0)` false; `vaRinnovata(1000, 701)` true (mancano 299 s); `vaRinnovata(1000, 1200)` true (scaduta); `vaRinnovata(1000, 700)` false (esattamente 300 s).
- [ ] **Step 2: Run, deve fallire.**
- [ ] **Step 3: Implementazione.** `SessionPolicy` come sopra (`expiresAt - nowS < MARGINE_S`). `Store` con `EncryptedSharedPreferences.create(context, "zapp-tv", MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(), PrefKeyEncryptionScheme.AES256_SIV, PrefValueEncryptionScheme.AES256_GCM)`; `deviceToken` generato con `SecureRandom` (32 byte) in base64url senza padding, prefisso `zc_` (identico a ZConnection `Store.kt`: copiarne la funzione); `tokenHash()` con `MessageDigest("SHA-256")` hex; `session` serializzato come tre chiavi; `baseUrl` = `BuildConfig.BASE_DEBUG` se non vuoto, altrimenti `"https://zapp-mu.vercel.app"` (override `base_url` solo in debug).
- [ ] **Step 4: Run, deve passare; `assembleDebug` compila.**
- [ ] **Step 5: Commit** — `feat(store): deposito cifrato di token e sessione, regola di rinnovo`

---

### Task 4: `DeviceApi` (abbinamento, scrobble, comandi) — porto di `Api.kt`

**Files:**
- Create: `android/app/src/main/java/com/zapp/tv/api/DeviceApi.kt`
- Create: `android/app/src/main/java/com/zapp/tv/api/Revoca.kt`
- Test: `android/app/src/test/java/com/zapp/tv/api/RevocaTest.kt`, `DeviceApiTest.kt` (MockWebServer)

**Interfaces:**
- Consumes: `Store` (Task 3), `JsonZapp`, `Session`, `MeUser`.
- Produces: `class DeviceApi(store: Store, client: OkHttpClient = OkHttpClient.Builder().connectTimeout(8, SECONDS).readTimeout(12, SECONDS).build())` con:
  - `suspend fun registra(): Registrazione?` → `POST /api/devices/pair` `{install_id, token_hash, name, platform:"fire_tv"|"android_tv"}` → `Registrazione(code, expiresAt)`;
  - `suspend fun statoAbbinamento(code): Abbinamento` = `Pending | Claimed(deviceId, session, user: MeUser?) | Scaduto | Rete`;
  - `suspend fun qr(code): ByteArray?`;
  - `suspend fun manda(eventi: List<JSONObject>): Esito` (`OK, RETE, REVOCATO, CONSENSO`), body `{"source":"android","events":[…]}`;
  - `suspend fun comando(esito: String?): JSONObject?` (`GET /api/devices/commands[?esito=id:ok]`).
  - `class Revoca(soglia = 3) { fun su401(): Boolean /* true = revoca */; fun suSuccesso() }` puro.
- Platform: `"fire_tv"` se `Build.MANUFACTURER` contiene "Amazon", altrimenti `"android_tv"`.

- [ ] **Step 1: Test `Revoca`**: due 401 → false, terzo → true; un successo azzera.
- [ ] **Step 2: Test `DeviceApi` con MockWebServer**: (a) `statoAbbinamento` con `{"status":"pending"}` → `Pending`; con `{"status":"claimed","device_id":"d1","user":{"id":"u1","username":"m","avatar_url":null},"session":{"accessToken":"a","refreshToken":"r","expiresAt":1}}` → `Claimed` con `deviceId == "d1"` e `session.refreshToken == "r"`; con 401 → `Scaduto` (non conta per la revoca); (b) `manda` con 403 → `CONSENSO`, con 401×3 → `REVOCATO` e `store.deviceId == null` dopo (usare uno `Store` finto: interfaccia `StoreDispositivo` con le sole proprieta' usate, implementata in memoria nel test); (c) header `Authorization: Bearer <deviceToken>` presente sulle richieste di scrobble e comandi.
- [ ] **Step 3: Run, deve fallire.**
- [ ] **Step 4: Implementazione**: portare `Api.kt` di ZConnection funzione per funzione su OkHttp (stesse rotte, stessi codici, stessa semantica 401/403), aggiungendo la lettura di `session` e `user` nella risposta `claimed` (`avatar_url` del server → `MeUser.avatarPath`). `Store` espone `StoreDispositivo` per il test. Coroutine con `withContext(Dispatchers.IO)`.
- [ ] **Step 5: Run, deve passare.**
- [ ] **Step 6: Commit** — `feat(api): DeviceApi da ZConnection su OkHttp, con sessione al reclamo`

---

### Task 5: `ZappApi` (rotte `/api/tv/v1`) con rinnovo e revoca

**Files:**
- Create: `android/app/src/main/java/com/zapp/tv/api/ZappApi.kt`
- Create: `android/app/src/main/java/com/zapp/tv/api/AuthInterceptor.kt`
- Test: `android/app/src/test/java/com/zapp/tv/api/ZappApiTest.kt`

**Interfaces:**
- Produces: `class ZappApi(store: Store, onRevocato: () -> Unit, client: OkHttpClient = …)` con `suspend fun home(): HomeResponse`, `shelf(key): ShelfResponse` (chiave codificata con `URLEncoder`), `library(status, type: String?, offset, limit): LibraryPage`, `search(q): SearchResponse`, `title(mediaType, id): TitleDetail`, `season(id, n): SeasonDetail`, `watch(titleId, mediaType, action, season: Int? = null, episode: Int? = null, rating: Int? = null): WatchResult`, `play(titleId, mediaType, providerId): LaunchPlan`, `playResult(commandId, result)`, `me(): MeResponse`, `providers(): ProvidersResponse`, `signout()`. Errori: `class ApiException(val status: Int, message: String)`.
- `AuthInterceptor`: aggiunge `Authorization: Bearer <accessToken>` e `X-Zapp-Device: <deviceId>`; prima della chiamata, se `SessionPolicy.vaRinnovata`, rinnova (`POST /api/tv/v1/auth/refresh`, **senza** bearer); su 401 rinnova una volta e ripete; su 401 dopo il rinnovo o su 410 chiama `onRevocato()` (che fa `store.dimentica()`) e lancia `ApiException`.

- [ ] **Step 1: Test con MockWebServer**: (a) `me()` manda entrambi gli header; (b) sessione con `expiresAt` fra 2 minuti → prima richiesta e' `POST /api/tv/v1/auth/refresh` con body `{"refresh_token":"r"}` e senza `Authorization`, poi `/me` col token nuovo, e `store.session.accessToken` aggiornato; (c) `/me` risponde 401 → refresh → `/me` ok (tre richieste); (d) 401 anche dopo il refresh → `onRevocato` chiamato una volta, `ApiException(401)`; (e) 410 → `onRevocato`, `ApiException(410)`; (f) `shelf("persone|Regia:Denis Villeneuve")` chiama `/api/tv/v1/home/shelf/persone%7CRegia%3ADenis%20Villeneuve`; (g) `watch(...)` manda il body `{"titleId":1,"mediaType":"movie","action":"want"}` senza chiavi nulle.
- [ ] **Step 2: Run, deve fallire.**
- [ ] **Step 3: Implementazione** (OkHttp `Interceptor` per gli header e il rinnovo con un `Mutex` per non rinnovare due volte in parallelo; corpo JSON con `JsonZapp.encodeToString` di piccole `@Serializable` classi di richiesta con `explicitNulls = false`).
- [ ] **Step 4: Run, deve passare.**
- [ ] **Step 5: Commit** — `feat(api): ZappApi con bearer, X-Zapp-Device, rinnovo su 401 e revoca su 410`

---

### Task 6: Ascolto e comandi — porto di ZConnection

**Files:**
- Create (copiati da `D:\PROGETTI\ZConnection\app\src\main\java\com\zapp\zconnection\` con package `com.zapp.tv.ascolto`): `ZListener.kt`, `SessionProbe.kt`, `Sender.kt`, `Comandi.kt`, `Stato.kt`, `ProbeLog.kt`
- Create: `android/app/src/main/java/com/zapp/tv/ascolto/Lancio.kt` (puro, estratto da `Comandi.esegui`)
- Modify: `AndroidManifest.xml` (servizio `ZListener`)
- Test: `android/app/src/test/java/com/zapp/tv/ascolto/LancioTest.kt`

**Interfaces:**
- Consumes: `DeviceApi.manda`, `DeviceApi.comando`, `Store`.
- Produces: `object Lancio { data class Piano(val pkg: String, val dataUri: String?, val extra: String?); fun scegliPackage(candidati: List<String>, installati: (String) -> Boolean): String?; fun intent(piano: Piano, launcher: (String) -> Intent?): Intent }` — l'intent e' costruito ESATTAMENTE come `Comandi.esegui` di ZConnection: `ACTION_VIEW`, `setPackage`, `FLAG_ACTIVITY_NEW_TASK or FLAG_ACTIVITY_CLEAR_TASK`, `data = Uri.parse(dataUri)` se c'e', `putExtra("amzn_deeplink_data", extra)` + `component = ComponentName(pkg, "$pkg.MainActivity")` se c'e' l'extra; senza uri ne' extra → `launcher(pkg)` + `NEW_TASK`. `Comandi` e (nel Task 10) il Play della scheda usano `Lancio`.
- Il servizio nel manifest:
  ```xml
  <service android:name=".ascolto.ZListener" android:exported="true"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
    <intent-filter><action android:name="android.service.notification.NotificationListenerService" /></intent-filter>
  </service>
  ```

- [ ] **Step 1: Test `Lancio`** (puro; `Intent` e' una classe Android: con `unitTests.isReturnDefaultValues = true` i getter ritornano null, quindi il test verifica `scegliPackage` e le decisioni di `intent` attraverso un `Piano` → `Descrizione` intermedia: aggiungere `fun descrivi(piano: Piano): Descrizione(action: String, pkg: String, uri: String?, extra: String?, component: String?, clearTask: Boolean)` pura e testarla): Netflix con extra → component `com.netflix.ninja/com.netflix.ninja.MainActivity`, uri null, extra `70143836`, clearTask true; Disney con uri → component null, uri `https://www.disneyplus.com/play/<uuid>`; NOW (nessuno dei due) → action `launch`, clearTask false; `scegliPackage(["com.netflix.ninja","com.netflix.mediaclient"]) { it == "com.netflix.mediaclient" }` → `com.netflix.mediaclient`; nessuno installato → null.
- [ ] **Step 2: Run, deve fallire.**
- [ ] **Step 3: Copiare i sei file**, cambiare il package, sostituire `Api` con `DeviceApi` (le firme sono le stesse a meno di `suspend`: dentro `HandlerThread` usare `runBlocking`), sostituire `Store` di ZConnection con quello nuovo, `Comandi.esegui` usa `Lancio`. **Non cambiare** intervalli, soglie, code, backoff: sono misurati (30 s di battito, 2 s di sondaggio, 200 in coda, 50 per lotto, `[5,15,60]` s).
- [ ] **Step 4: Run test, deve passare; `assembleDebug` compila.**
- [ ] **Step 5: Commit** — `feat(ascolto): listener, sonda, invio e comandi portati da ZConnection, lancio estratto e testato`

---

### Task 7: Tema, font, tessere e URL delle immagini

**Files:**
- Create: `android/app/src/main/res/font/inter_regular.ttf`, `inter_semibold.ttf`, `inter_bold.ttf` (da `https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip`, cartella `extras/ttf/`; licenza OFL → `android/app/src/main/res/font/OFL.txt`)
- Create: `android/app/src/main/java/com/zapp/tv/ui/Tema.kt`, `ui/Tessere.kt`, `ui/Immagini.kt`
- Test: `android/app/src/test/java/com/zapp/tv/ui/ImmaginiTest.kt`

**Interfaces:**
- Produces: `object Immagini { fun poster(path: String?, size: String = "w342"): String?; fun backdrop(path: String?, size: String = "w780"): String?; fun logo(path: String?): String? }` (base `https://image.tmdb.org/t/p/`; `null` resta `null`; un `path` gia' `http` torna intero — e' `imageUrl` delle tessere "Continua"); `object Colori { Bg, Surface, Surface2, Border, Text, Muted, Accent, AccentStrong, AccentSoft, Danger }`; `@Composable fun ZappTema(content)` (tv-material `darkColorScheme` con quei colori, tipografia Inter: `titolo 40sp bold`, `sezione 28sp semibold`, `corpo 24sp`, `didascalia 20sp muted`); `@Composable fun TesseraPoster(card: TitleCard, onClick, modifier)` (poster 2:3 larga 180dp, scala 1.08 a fuoco e bordo bianco 3dp via `ClickableSurfaceDefaults.scale/border`, sotto nome e anno, pillola ZappScore se non nullo); `@Composable fun TesseraContinua(card: ContinueCard, onClick)` (16:9 larga 320dp con `imageUrl`, etichetta episodio, barra di avanzamento da `progressPct` o `resumePositionMs/resumeDurationMs`).

- [ ] **Step 1: Test `Immagini`**: `poster("/p.jpg")` = `https://image.tmdb.org/t/p/w342/p.jpg`; `backdrop("/b.jpg","original")`; `poster(null)` null; `poster("https://image.tmdb.org/t/p/original/x.jpg")` invariato; `logo("/n.jpg")` = `…/w92/n.jpg`.
- [ ] **Step 2: Run, deve fallire.**
- [ ] **Step 3: Implementazione** di `Immagini`, `Tema`, `Tessere` (Coil `AsyncImage` con `crossfade`, segnaposto `Surface2`).
- [ ] **Step 4: Run, deve passare; `assembleDebug` compila.**
- [ ] **Step 5: Commit** — `feat(ui): tema del sito, Inter, tessere a fuoco, URL delle immagini`

---

### Task 8: Navigazione, abbinamento e barra laterale

**Files:**
- Modify: `MainActivity.kt` (NavHost)
- Create: `ui/Navigazione.kt` (rotte: `abbinamento`, `home`, `titolo/{mediaType}/{id}`, `stagione/{id}/{n}`, `cerca`, `libreria`, `impostazioni`), `ui/BarraLaterale.kt`, `ui/abbinamento/AbbinamentoScreen.kt`, `ui/abbinamento/AbbinamentoViewModel.kt`
- Create: `Grafo.kt` (`object Grafo` con `store`, `deviceApi`, `zappApi`, `avviaAscolto()`: un contenitore manuale, niente DI esterna)

**Interfaces:**
- Consumes: `DeviceApi.registra/statoAbbinamento/qr`, `Store.salvaAbbinamento`.
- Produces: `sealed class StatoAbbinamento { Caricamento; Codice(code, qr: ImageBitmap?, scadenza: Long); Abbinato; Errore(msg) }`; all'avvio `MainActivity` va a `home` se `store.deviceId != null && store.session != null`, altrimenti `abbinamento`. `onRevocato` di `ZappApi` = `store.dimentica()` + naviga ad `abbinamento` svuotando lo stack.

- [ ] **Step 1: ViewModel**: `registra()` → codice + QR (`BitmapFactory.decodeByteArray` → `asImageBitmap()`); sondaggio ogni 3 s con `viewModelScope`; alla scadenza (`expires_at`) nuovo codice; su `Claimed` → `store.salvaAbbinamento(...)`, `Grafo.avviaAscolto()`, stato `Abbinato`; su `Rete` mostra "Zapp non raggiunge il server" e continua a provare.
- [ ] **Step 2: Schermata**: sfondo `Bg`, a sinistra il codice a cifre da 96 sp raggruppate `123 456`, a destra il QR 320dp, sotto "Vai su zapp-mu.vercel.app/devices/pair dal telefono e inserisci il codice"; nessun elemento a fuoco necessario (schermata passiva) ma un bottone "Nuovo codice".
- [ ] **Step 3: Barra laterale**: colonna larga 72dp (icone) che si allarga a 240dp a fuoco con le etichette; voci Home / Cerca / Libreria / Impostazioni; `BackHandler` sulla barra chiude l'Activity (`finish()`); da una schermata, Indietro porta il fuoco alla barra. Le icone sono `ImageVector` disegnate a mano in `ui/Icone.kt` (casa, lente, libreria, ingranaggio: path semplici, niente libreria di icone).
- [ ] **Step 4: `assembleDebug` compila.** Nessun test unitario (Compose).
- [ ] **Step 5: Commit** — `feat(ui): navigazione, abbinamento con codice e QR, barra laterale`

---

### Task 9: Home — carosello, Continua, scaffali pigri

**Files:**
- Create: `ui/home/HomeScreen.kt`, `ui/home/HomeViewModel.kt`, `ui/home/Carosello.kt`, `ui/home/Scaffale.kt`
- Create: `ui/home/Scaffali.kt` (puro: ordine e stato di carico)
- Test: `android/app/src/test/java/com/zapp/tv/ui/home/ScaffaliTest.kt`

**Interfaces:**
- Consumes: `ZappApi.home()`, `ZappApi.shelf(key)`.
- Produces: `data class StatoScaffale(val ref: ShelfRef, val items: List<TitleCard>?, val errore: Boolean)`; `class CaricoScaffali(refs) { fun daCaricare(visibiliFinoA: Int, finestra: Int = 2): List<String> }` puro (carica gli scaffali visibili piu' i due successivi, mai due volte lo stesso, mai quelli gia' in errore prima di un `riprova()`).

- [ ] **Step 1: Test `CaricoScaffali`**: 6 ref; `daCaricare(0)` → i primi 3 (0,1,2); segnati caricati; `daCaricare(1)` → [3]; `daCaricare(1)` di nuovo → []; `segnaErrore(3)`, `daCaricare(1)` → [] ; `riprova(3)`, `daCaricare(1)` → [3].
- [ ] **Step 2: Run, deve fallire.** — [ ] **Step 3: Implementazione**.
- [ ] **Step 4: ViewModel**: `carica()` → `home()`; `onScaffaleVisibile(indice)` → per ogni chiave da `daCaricare` lancia `shelf(key)` in `viewModelScope` (max 2 in parallelo con un `Semaphore`), aggiorna la lista; ricarica `home()` al ritorno in primo piano (`Lifecycle.Event.ON_RESUME`) se sono passati > 60 s.
- [ ] **Step 5: Schermata**: `LazyColumn` con: carosello hero (backdrop `w780` a tutta larghezza 16:9, titolo 40sp, motivo/affinita', overview 3 righe, avanza da solo ogni 8 s, `LazyRow` orizzontale a fuoco), fila "Continua a guardare" (`TesseraContinua`), poi uno `Scaffale` per ogni `ShelfRef` (titolo sezione + `LazyRow` di `TesseraPoster`; `layout == "numbered"` mostra il numero grande a sinistra della copertina; `"backdrop"` usa tessere 16:9); ogni riga chiama `onScaffaleVisibile(indice)` al primo `LaunchedEffect`. Fuoco: `Modifier.focusRestorer()` su ogni `LazyRow`; il fuoco iniziale sulla prima tessera di "Continua" (o del carosello). Click su una tessera → `titolo/{mediaType}/{id}`.
- [ ] **Step 6: `assembleDebug` compila; test verde.**
- [ ] **Step 7: Commit** — `feat(home): carosello, Continua a guardare, scaffali caricati a scorrimento`

---

### Task 10: Scheda titolo con Play, trailer, stato

**Files:**
- Create: `ui/titolo/TitoloScreen.kt`, `ui/titolo/TitoloViewModel.kt`, `ui/titolo/Azioni.kt`
- Create: `ui/titolo/Stato.kt` (puro: prossima azione e testi)
- Test: `android/app/src/test/java/com/zapp/tv/ui/titolo/StatoTest.kt`

**Interfaces:**
- Consumes: `ZappApi.title/watch/play/playResult`, `Lancio` (Task 6), `Immagini`.
- Produces: `object StatoTitolo { fun etichettaPlay(offer: ProviderOffer): String /* "Guarda su Netflix" | "Apri su Prime Video" (scheda) */; fun bottoneStato(entry: UserEntry?, mediaType): List<Azione> /* es. senza entry: [DaVedere, Visto]; want: [InCorso, Visto, Rimuovi]; watching: [Visto, Abbandona]; watched: [Rivedi(=watching), Rimuovi] */; fun testoProssimo(entry: UserEntry?): String? /* "Prossimo: S1:E4" */ }`.
- Flusso Play: `play(titleId, mediaType, providerId)` → `LaunchPlan` → `Lancio.scegliPackage(plan.android.packages) { pm.getPackageInfo }` → se null `playResult(commandId, "assente")` e toast "Netflix non e' installata su questa TV"; altrimenti `startActivity(Lancio.intent(...))` dentro try → `playResult(commandId, "ok")`, in catch `"errore"`.

- [ ] **Step 1: Test `StatoTitolo`**: `etichettaPlay` con `expected "avvia"` → "Guarda su Netflix", `"scheda"` → "Apri su Prime Video"; `bottoneStato(null,"movie")` → `[DaVedere, Visto]`; `bottoneStato(want)` → `[InCorso, Visto, Rimuovi]`; `bottoneStato(watching, "tv")` → `[Visto, Abbandona]`; `testoProssimo(entry con next S1E4)` → `"Prossimo: S1:E4"`, senza next → null.
- [ ] **Step 2: Run, deve fallire.** — [ ] **Step 3: Implementazione.**
- [ ] **Step 4: ViewModel + schermata**: fondale = backdrop `original` con velo nero in basso e tinta `palette.primary` (parse `#rrggbb`) al 25%; colonna sinistra: poster; destra: nome 40sp, anno · generi · durata, ZappScore + voti, tagline, overview (espandibile con OK), riga azioni (`Button` tv-material): un "Guarda su X" per ogni `ProviderOffer` con `canLaunch` (fuoco iniziale qui), "Trailer" se `trailer != null` (intent `Intent(ACTION_VIEW, Uri.parse("vnd.youtube:$id"))` con ripiego `https://www.youtube.com/watch?v=$id`), i bottoni di stato da `bottoneStato` che chiamano `watch(...)` e ricaricano la scheda, "Stagioni" (solo tv, va a `stagione/{id}/{next.season ?: 1}`); sotto: cast (fila di tondi 96dp), "Simili" (fila di `TesseraPoster`). Errori: rete → schermata con "Riprova"; 404 → "Titolo non trovato".
- [ ] **Step 5: `assembleDebug` compila; test verde.**
- [ ] **Step 6: Commit** — `feat(titolo): scheda con Play che apre la piattaforma, trailer, stato in libreria`

---

### Task 11: Stagione ed episodi

**Files:**
- Create: `ui/stagione/StagioneScreen.kt`, `ui/stagione/StagioneViewModel.kt`

**Interfaces:**
- Consumes: `ZappApi.season(id, n)`, `ZappApi.title` (per le stagioni disponibili), `ZappApi.watch(action="episode", season, episode)`.

- [ ] **Step 1: ViewModel**: carica `season`; `segnaVisto(episode)` → `watch(titleId, "tv", "episode", n, episode)` → ricarica.
- [ ] **Step 2: Schermata**: in alto pillole delle stagioni (da `TitleDetail.seasons`, la corrente evidenziata, OK cambia stagione); lista verticale di episodi: still 16:9 160dp, "E4 · Storpi", durata, overview 2 righe, spunta se `watched`, barra se `resumeMs`; OK su un episodio → "Segna visto fino a qui" (con conferma su un secondo OK).
- [ ] **Step 3: `assembleDebug` compila.** — [ ] **Step 4: Commit** — `feat(stagione): episodi con spunte e "visto fino a qui"`

---

### Task 12: Ricerca

**Files:**
- Create: `ui/cerca/CercaScreen.kt`, `ui/cerca/CercaViewModel.kt`
- Test: `android/app/src/test/java/com/zapp/tv/ui/cerca/DebounceTest.kt` (con `kotlinx-coroutines-test`)

**Interfaces:**
- Consumes: `ZappApi.search(q)`.
- Produces: nel ViewModel `val query = MutableStateFlow("")` → `results` via `debounce(400).filter { it.length >= 2 }.mapLatest { api.search(it) }`.

- [ ] **Step 1: Test**: con `runTest` e un'API finta, scrivere "d", "du", "dun", "dune" in 100 ms → una sola chiamata con "dune"; scrivere "x" → nessuna chiamata.
- [ ] **Step 2: Run, deve fallire.** — [ ] **Step 3: Implementazione** (ViewModel con `api: suspend (String) -> SearchResponse` iniettata per il test).
- [ ] **Step 4: Schermata**: `TextField` in alto (tastiera di sistema della TV; `KeyboardOptions(imeAction = Search)`), sotto `LazyVerticalGrid` di `TesseraPoster` (6 colonne); stato vuoto "Cerca un film o una serie".
- [ ] **Step 5: `assembleDebug` compila; test verde.** — [ ] **Step 6: Commit** — `feat(cerca): ricerca con tastiera TV e griglia`

---

### Task 13: Libreria

**Files:**
- Create: `ui/libreria/LibreriaScreen.kt`, `ui/libreria/LibreriaViewModel.kt`

**Interfaces:**
- Consumes: `ZappApi.library(status, type, offset, 60)`.

- [ ] **Step 1: ViewModel**: stato `(status = "watching", type: String? = null, items, total, caricando)`; `cambia(status, type)` azzera e ricarica; `caricaAltri()` quando l'ultima riga e' visibile e `items.size < total`.
- [ ] **Step 2: Schermata**: pillole di stato (Sto guardando / Da vedere / Visti / Abbandonati) e filtro (Tutti / Film / Serie) in alto come `Button` tv-material; conteggio "N titoli"; `LazyVerticalGrid` 6 colonne di `TesseraPoster` con il voto dell'utente (stellina) se `rating != null`; stato vuoto "Niente qui".
- [ ] **Step 3: `assembleDebug` compila.** — [ ] **Step 4: Commit** — `feat(libreria): stati, filtri e griglia a pagine`

---

### Task 14: Impostazioni, ascolto e disconnessione

**Files:**
- Create: `ui/impostazioni/ImpostazioniScreen.kt`, `ui/impostazioni/ImpostazioniViewModel.kt`
- Create: `ascolto/Permesso.kt` (porto di `Ui.haAccessoNotifiche`, `riagganciaAscolto`, `indirizzoLocale` di ZConnection)

**Interfaces:**
- Consumes: `ZappApi.me/signout`, `Store.dimentica`, `Permesso.concesso(context)`, `Stato` (ultimo invio, coda).

- [ ] **Step 1: Schermata**: sezioni: **Account** (username/displayName, "Cambia utente" → `signout()` + `dimentica()` + `abbinamento`); **Questa TV** (nome, piattaforma, `listening` dal server e permesso locale: "Ascolto attivo" / "Ascolto spento: concedi l'accesso alle notifiche" con il testo di ZConnection sul comando adb e l'`indirizzoLocale()` — su Fire OS non c'e' la schermata di sistema; su Android TV un bottone che apre `ACTION_NOTIFICATION_LISTENER_SETTINGS` se risolve); ultimo invio e coda da `Stato`; **Info** (versione, `tmdbAttribution` sempre visibile, "Zapp non riproduce contenuti: apre le app delle piattaforme").
- [ ] **Step 2: `onResume` della schermata chiama `Permesso.riaggancia(context)`** (come ZConnection: dopo la concessione il servizio resta cieco finche' non si riaggancia).
- [ ] **Step 3: `assembleDebug` compila.** — [ ] **Step 4: Commit** — `feat(impostazioni): account, ascolto, attribuzione TMDB`

---

### Task 15: Collaudo sulla Fire TV, documentazione

**Files:**
- Modify: `LEGGIMI.md` (come si collauda)
- Create: `docs/collaudo-2026-09-13.md`, `docs/note-per-zapp.md` (il repo Zapp non si tocca da qui: le note per `docs/architecture/tv.md` le porta in Zapp il controller)

- [ ] **Step 1: Build contro un'istanza locale** (il controller avvia Zapp con `NEXT_DIST_DIR=.next-tv pnpm exec next start -H 0.0.0.0 -p 3402` nel worktree): `./gradlew --no-daemon :app:assembleDebug -PzappBase=http://<ip-pc>:3402`.
- [ ] **Step 2: Installazione** (l'IP della Fire TV si rilegge dalle impostazioni di rete): `adb connect <ip>:5555 && adb install -r app/build/outputs/apk/debug/app-debug.apk && adb shell am start -n com.zapp.tv/.MainActivity`.
- [ ] **Step 3: Percorso di collaudo** (uno per riga, esito da annotare in `docs/collaudo-2026-09-13.md` del repo ZappTV): abbinamento (codice + QR, conferma dal telefono, arrivo in Home); Home (carosello, Continua, almeno tre scaffali che si riempiono scorrendo, una rail personale con la chiave codificata); Scheda (Play su Netflix → titolo che parte; Disney+ → parte; Prime → scheda; trailer → app YouTube; Da vedere → compare in libreria sul telefono); Stagione (spunta episodio); Ricerca ("dune"); Libreria (cambio stato, "carica altri"); Impostazioni (permesso notifiche concesso da adb: `adb shell settings put secure enabled_notification_listeners com.zapp.tv/com.zapp.tv.ascolto.ZListener`, poi riapri l'app; ascolto NOW/Disney+ → tessera "Continua" che si muove sul telefono); Play da Zapp web sul telefono (tondo TV) → la TV apre il titolo; revoca da `/devices` sul telefono → la TV torna al codice entro un minuto (410); token dispositivo revocato → 401×3 → codice.
- [ ] **Step 4: Ogni difetto trovato**: un commit `fix(...)` per difetto, con la misura nel messaggio.
- [ ] **Step 5: `LEGGIMI.md` e `docs/note-per-zapp.md`** (cosa deve cambiare in `tv.md`: trappole della TV, versione dell'app, comando adb del permesso).
- [ ] **Step 6: Commit** — `docs: collaudo sulla Fire TV e note per Zapp`. Tag `v0.1-fase-b`.
