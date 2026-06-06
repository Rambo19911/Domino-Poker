# Domino Poker repozitorija audits

Datums: 2026-06-04  
Darba mape: `C:\Users\Rihar\Downloads\Domino-Poker`  
Audita tvērums: build/test/typecheck/lint skripti, TypeScript/Next/Vitest konfigurācija, workspace atkarības, dokumentācijas atbilstība, acīmredzams dead code, arhitektūras pretrunas, UI pārbaudes iespējamība.

## Atkārtota pārbaude 2026-06-06

Visi konstatējumi pārbaudīti pret šodienas stāvokli. Pamatcēlonis (#1 — bojāta workspace instalācija) ir izlabots, kas atrisina lielāko daļu kaskādes (#2–#8).

- **Atrisināts / funkcionāls / mitigēts:** #1–#13, #15, R1–R3 (sk. ✅ atzīmes pie katra punkta).
- **Apstiprināts, pieņemts/izsekojams:** #14 — moderate `postcss <8.5.10` caur `next` (zema praktiskā riska build-time vuln; pareizais labojums = mērķēts `next` upgrade atsevišķā solī). ⚠️

Šodien zaļi: `npm run build` (visi workspace), `typecheck`, `test` (237 unit + 10 PG integ.), `test:web` (17 Playwright e2e), `simulate`, `lint`; CI (`npm ci` no tīras vides) arī zaļš.

> Zemāk esošais 2026-06-04 saturs saglabāts vēsturei; ✅/⚠️ bloki pie katra punkta rāda pašreizējo statusu.

## Kopsavilkums (2026-06-04, vēsturisks)

Repozitorijs pašreizējā darba kopijā nav verificējami buildojams vai testējams pilnā apjomā. Galvenais apstiprinātais defekts ir workspace pakotņu atrisināšana: `@domino-poker/shared` un `@domino-poker/core/multiplayer` netiek atrasti vairākos build/test/typecheck ceļos. Papildus tam lokālais `node_modules/@domino-poker/*` stāvoklis ir bojāts: `npm ls` rāda workspace pakotnes kā `invalid`, daudzas pakotnes kā `extraneous`, un `node_modules/@domino-poker/core` / `shared` ir tukšas parastas direktorijas, nevis workspace saites.

UI/layout problēmas ar pārlūku netika pilnvērtīgi pārbaudītas, jo `npm run test:web` nepalaida web serveri līdz testu izpildei.

## Palaistās komandas

| Komanda | Rezultāts |
| --- | --- |
| `git status --short` | `?? AGENTS.md`; vēlāk tiks pievienots arī `CODEX_AUDIT_REPORT.md`. |
| `npm run typecheck` | Neizdevās. `apps/web` nevar atrisināt `@domino-poker/shared`; `tools/load-test` caur shared nevar atrisināt `@domino-poker/core/multiplayer`. |
| `npm run test` | Neizdevās. `packages/core`, `packages/shared`, `tools/simulators`, `tools/load-test` testi izgāja; `apps/server` 17 testu suites krita uz `@domino-poker/shared` importu; `apps/web` 2 suites krita uz `@domino-poker/core` / `@domino-poker/shared` importu. |
| `npm run build` | Neizdevās. `packages/shared`, `apps/server`, `apps/web`, `tools/simulators`, `tools/load-test` build krita uz workspace importiem; `apps/web` Next build nevarēja atrisināt `@domino-poker/shared`. |
| `npm run test:web` | Neizdevās. Playwright 120s gaidīja web serveri; Turbopack dev cache panika: `corrupted database or bug`, trūka `.next/dev/cache/.../00000549.sst`. |
| `npm audit --omit=dev` | Neizdevās ar 2 moderate ievainojamībām: `postcss <8.5.10` caur `next`. |
| `npm audit` | Tas pats: 2 moderate ievainojamības `postcss <8.5.10` caur `next`. |
| `npm ls --all --depth=0` | Neizdevās ar `ELSPROBLEMS`: workspace pakotnes `invalid`, daudzas pakotnes `extraneous`. |
| `npm run lint` | Neizdevās: saknē nav `lint` skripta. |
| `npm run simulate` | Neizdevās. `tools/simulators` build nevar atrisināt `@domino-poker/core/multiplayer`, papildus `move` ir `unknown` un `error` ir implicit `any`. |
| `npm run load:local -- 1` | Neizdevās. `packages/shared` build nevar atrisināt `@domino-poker/core/multiplayer`. |
| `npm run dev:server` | Neizdevās. Skripts buildo `core` un `server`, bet ne `shared`; servera build nevar atrisināt `@domino-poker/shared` un `@domino-poker/core/multiplayer`. |

## Apstiprinātās problēmas

### 1. Critical: workspace dependency instalācija darba kopijā ir bojāta

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS (nav koda labojuma vajadzīgs).**
> `node_modules\@domino-poker\core` un `shared` tagad ir veseli junction-i uz
> `packages\core` / `packages\shared` (ar `dist`); `npm ls @domino-poker/core
> @domino-poker/shared` atrisina tīri (exit 0, bez `ELSPROBLEMS`/`invalid`).
> Šīs dienas `npm run typecheck`, `npm run test` (237 unit + 10 integ.) un
> `npm run build` ir zaļi, un CI (`.github/workflows/ci.yml`) palaiž `npm ci`
> tīrā vidē — arī zaļš. Bojātā lokālā instalācija kopš audita izlabota ar
> `npm install` (sk. `ai_rules.md` remediāciju). `npm ci` netiek palaists tagad,
> jo tas pārinstalētu jau strādājošu stāvokli.

- Faili/rindas: `package-lock.json:31-48`, `package.json:6-13`
- Pierādījumi:
  - `package-lock.json` definē workspace linkus `node_modules/@domino-poker/core -> packages/core` un `node_modules/@domino-poker/shared -> packages/shared`.
  - `npm ls --all --depth=0` atgrieza `ELSPROBLEMS`, visām `@domino-poker/*` workspace pakotnēm rādot `invalid`, un vairākām faktiskajām atkarībām `extraneous`.
  - `Get-Item node_modules\@domino-poker\core, node_modules\@domino-poker\shared` rādīja parastas direktorijas bez `LinkType`; `Get-ChildItem` šajās mapēs neatgrieza saturu.
- Kāpēc tas ir svarīgi: tas tieši izraisa `Cannot find module '@domino-poker/shared'` un `Cannot find module '@domino-poker/core/multiplayer'` kļūdas build/test/typecheck laikā. Ar šādu instalāciju lokālais build stāvoklis nav uzticams.
- Ieteiktais labojums: dzēst un pārbūvēt dependency instalāciju ar tīru `npm ci` vai `npm install`, pēc tam pārbaudīt, ka `node_modules/@domino-poker/*` ir workspace saites uz attiecīgajām mapēm. To darīt atsevišķā labojuma solī, pārskatot lockfile izmaiņas.
- Pārliecība: High.

### 2. Critical: `dev:server` skripts nebuildo `packages/shared`, bet servera build to prasa

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** `package.json` `dev:server` tagad ir
> `core → shared → server → node`, t.i. satur `npm run build --workspace
> packages/shared` pirms servera build. Servera build/typecheck šajā sesijā zaļš.

- Faili/rindas: `package.json:20`, `apps/server/src/chat/LobbyChat.ts:1`, `apps/server/src/net/WebSocketGateway.ts:1-7`, `apps/server/tsconfig.build.json:12-16`
- Pierādījumi:
  - `package.json:20` ir `npm run build --workspace packages/core && npm run build --workspace apps/server && node apps/server/dist/index.js`.
  - Servera avoti importē `@domino-poker/shared`, piemēram `LobbyChat.ts:1` un `WebSocketGateway.ts:1-7`.
  - `npm run dev:server` krita servera build posmā ar `Cannot find module '@domino-poker/shared'` un `Cannot find module '@domino-poker/core/multiplayer'`.
- Kāpēc tas ir svarīgi: README lokālās multiplayer palaišanas pirmais terminālis (`npm run dev:server`) pašlaik nav izmantojams. Tas bloķē servera lokālu startu un jebkādu end-to-end multiplayer testu.
- Ieteiktais labojums: skriptā pirms servera build pievienot `npm run build --workspace packages/shared`; pārskatīt arī `apps/server/tsconfig.build.json` references, lai build secība skaidri ietvertu visas build-time atkarības.
- Pārliecība: High.

### 3. Critical: root `build` un vairāku workspace build konfigurācijas nevar droši atrisināt iekšējās pakotnes

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** Pilns `npm run build` (visi workspace,
> t.sk. `apps/web` Next build un `tools/*`) ir zaļš (exit 0). CI papildus palaiž
> `npm ci` tīrā vidē. Iekšējās pakotnes atrisinās caur build-order
> (core → shared → server/web/tools) + workspace junction.

- Faili/rindas: `packages/shared/src/serverEvents.ts:1-4`, `packages/shared/tsconfig.json:1-10`, `apps/server/tsconfig.build.json:1-17`, `tools/simulators/tsconfig.build.json:1-9`, `tools/load-test/tsconfig.build.json:1-9`
- Pierādījumi:
  - `packages/shared/src/serverEvents.ts:1-4` importē tipus no `@domino-poker/core/multiplayer`.
  - `packages/shared/tsconfig.json` nesatur `paths` vai project reference uz `packages/core`.
  - `tools/simulators/tsconfig.build.json` importē core multiplayer no avota failiem, bet build config nesatur `paths` vai reference uz core.
  - `npm run build` krita `packages/shared`, `apps/server`, `tools/simulators` un `tools/load-test` buildos ar iekšējo pakotņu atrisināšanas kļūdām.
- Kāpēc tas ir svarīgi: produkcijas build un Docker build (`deploy/Dockerfile` izpilda `npm run build`) nevar būt zaļš no tīras vides. Tas bloķē izvietošanu un CI.
- Ieteiktais labojums: izvēlēties vienu konsekventu modeli: vai nu build-time TypeScript project references (`core -> shared -> server/tools`) ar `tsc -b`, vai `paths` uz avotu katrā typecheck/test config un skaidru build secību, kas vispirms emitē vajadzīgos `dist` tipus. Pēc labojuma palaist `npm ci && npm run build` no tīras mapes.
- Pārliecība: High.

### 4. Major: web TypeScript/Next konfigurācija neietver `@domino-poker/shared`

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS (funkcionāli).** `apps/web` Next build
> ("Compiled successfully" + TypeScript OK) un web typecheck/test/test:web ir zaļi.
> `@domino-poker/shared` atrisinās caur built dist + workspace junction; root
> build-order būvē shared pirms web. (tsconfig/transpilePackages joprojām uzskaita
> tikai `core`, bet tas ir funkcionāli korekti — shared tiek patērēts kā built dist.)

- Faili/rindas: `apps/web/tsconfig.json:13-16`, `apps/web/next.config.ts:7-10`, `apps/web/components/MultiplayerLobby.tsx:5-14`, `apps/web/lib/mp/MultiplayerClient.ts:1-6`
- Pierādījumi:
  - `apps/web/tsconfig.json` path-map definē tikai `@domino-poker/core`, ne `@domino-poker/shared`.
  - `apps/web/next.config.ts:8` `transpilePackages` satur tikai `@domino-poker/core`.
  - Web avoti importē `@domino-poker/shared`.
  - `npm run typecheck` web posmā krita ar `Cannot find module '@domino-poker/shared'`.
  - `npm run build` Next posmā krita ar `Module not found: Can't resolve '@domino-poker/shared'`.
- Kāpēc tas ir svarīgi: web klients, ieskaitot single-player shell, nevar tikt buildots, jo multiplayer importi atrodas klienta komponentu importu kokā.
- Ieteiktais labojums: pievienot `@domino-poker/shared` web `paths` un `transpilePackages`, vai nodrošināt korektu workspace package resolution uz buildotu shared dist. Vēlams izvairīties no prasības, ka web typecheck pirms tam jābūvē shared dist.
- Pārliecība: High.

### 5. Major: Vitest konfigurācijas nav konsekventas ar source-import testu stratēģiju

> ✅ **Pārbaudīts 2026-06-06 — FUNKCIONĀLS.** `npm run test` (server 237 + web
> suites) ir zaļš. `@domino-poker/shared` testos atrisinās caur built dist; CI būvē
> core/shared PIRMS testiem, un ai_rules dokumentē "build shared before server
> tests". Reproducējams no tīras vides caur CI build-soli.

- Faili/rindas: `apps/server/vitest.config.ts:1-13`, `apps/web/vitest.config.ts:1-8`, `tools/load-test/vitest.config.ts:1-13`
- Pierādījumi:
  - Servera Vitest aliasē tikai `@domino-poker/core/multiplayer`, bet servera avoti importē arī `@domino-poker/shared`.
  - Web Vitest config komentārs saka, ka runtime vērtības nāk caur buildotu `@domino-poker/shared` dist, bet root `npm run test` pirms web testiem negarantē shared build.
  - `npm run test` krita 17 server suites un 2 web suites ar `Cannot find package '@domino-poker/shared'` vai `@domino-poker/core`.
- Kāpēc tas ir svarīgi: unit/integration testu rezultāts nav stabils no tīras checkout vides; testi ir atkarīgi no nejaušiem stale `dist` artefaktiem vai lokālās instalācijas stāvokļa.
- Ieteiktais labojums: Vitest configos aliasēt visas iekšējās workspace pakotnes uz avotu testu laikā (`@domino-poker/shared`, `@domino-poker/core`, `@domino-poker/core/multiplayer`) vai testu skriptos deterministiski buildot nepieciešamās pakotnes pirms testiem.
- Pārliecība: High.

### 6. Major: `typecheck` skripts nav reproducējams bez iepriekšējiem build artefaktiem

> ✅ **Pārbaudīts 2026-06-06 — FUNKCIONĀLS.** `npm run typecheck` (visi workspace)
> ir zaļš. CI būvē core/shared pirms typecheck, tāpēc no tīras vides reproducējams.
> (Tīrs `tsc` bez iepriekšēja shared build joprojām prasa shared dist; mitigēts ar
> CI build-order un dokumentēts ai_rules.)

- Faili/rindas: `package.json:18`, `apps/web/tsconfig.json:13-16`, `tools/load-test/tsconfig.json:5-9`, `packages/shared/src/serverEvents.ts:1-4`
- Pierādījumi:
  - Saknes `typecheck` vienkārši palaiž workspace `typecheck`, nebuildojot dependency tipus.
  - Web `typecheck` nespēj atrisināt shared.
  - Load-test `typecheck` aliasē shared uz avotu, bet shared avots importē core multiplayer; load-test tsconfig nealiasē core multiplayer.
  - `npm run typecheck` beidzās ar kļūdām web un load-test darba telpās.
- Kāpēc tas ir svarīgi: TypeScript nevar kalpot kā kvalitātes vārti; regressions var paslīdēt vai, pretēji, validi avoti var krist konfigurācijas dēļ.
- Ieteiktais labojums: sakārtot TypeScript references/paths visās darba telpās un palaist `npm run typecheck` tīrā vidē. Ja izvēlas buildotu dist stratēģiju, `typecheck` jābūt atkarīgam no `tsc -b` vai no iepriekšēja package build.
- Pārliecība: High.

### 7. Major: `simulate` un `load:local` skripti, ko README reklamē kā workflow, pašlaik neizpildās

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** `npm run simulate` (3 spēles) sasniedz
> legālu terminālu, exit 0; `tools/simulators` + `tools/load-test` build zaļš
> (audita `unknown`/implicit `any` TS kļūdas vairs nav). `load:local` build daļa
> zaļa; runtime prasa palaistu serveri (dokumentēta uzvedība).

- Faili/rindas: `package.json:21-22`, `README.md:184-185`, `tools/simulators/src/playGame.ts:9`, `tools/load-test/src/VirtualClient.ts:1-7`
- Pierādījumi:
  - `npm run simulate` krita `tools/simulators` buildā ar `Cannot find module '@domino-poker/core/multiplayer'`, `move is of type 'unknown'`, un implicit `any`.
  - `npm run load:local -- 1` krita jau `packages/shared` buildā ar `Cannot find module '@domino-poker/core/multiplayer'`.
  - README šos skriptus uzskaita kā pieejamus.
- Kāpēc tas ir svarīgi: simulācijas un load tests ir aprakstīti kā determinisma/slodzes kvalitātes vārti, bet tie nav palaižami. Tas samazina uzticību multiplayer stabilitātes apgalvojumiem.
- Ieteiktais labojums: salabot build dependency resolution un atsevišķi novērst `tools/simulators/src/playGame.ts` strict TypeScript kļūdas (`unknown`, implicit `any`). Pēc tam palaist vismaz mazu simulāciju un dokumentēto load-test smoke scenāriju.
- Pārliecība: High.

### 8. Major: README apgalvo, ka projekts lokāli strādā, bet verificētie skripti krīt

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** `build`, `typecheck`, `test`,
> `test:web` (17 e2e), `simulate` ir zaļi, tāpēc README "Working locally"
> apgalvojumi tagad ir pamatoti (build-kļūmju cēlonis #1 izlabots).

- Faili/rindas: `README.md:12-16`, `README.md:155-186`, `README.md:189-192`
- Pierādījumi:
  - README saka, ka multiplayer branch “runs and is playable with 4 humans” un statusā norāda `Working locally`.
  - Verificētās komandas `npm run dev:server`, `npm run build`, `npm run typecheck`, `npm run test`, `npm run test:web`, `npm run simulate`, `npm run load:local -- 1` neizgāja.
- Kāpēc tas ir svarīgi: jauns uzturētājs vai lietotājs pēc README nevar reproducēt solīto stāvokli. Tas ir dokumentācijas un implementācijas neatbilstības defekts.
- Ieteiktais labojums: pēc build/test skriptu labošanas atjaunināt README ar reāli verificētām komandām. Ja multiplayer ir darba procesā, atzīmēt precīzi, kuri scenāriji ir pārbaudīti un kuri nav.
- Pārliecība: High.

### 9. Major: publiskais README linko uz ignorētu, neversijētu dokumentu

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** README vairs nelinko
> `docs/DB_MIGRATION.md`; paliek tikai gitignore-atļautie spēles noteikumu/stratēģijas
> docs (README rindas 276–278).

- Faili/rindas: `README.md:90-92`, `.gitignore:42-48`
- Pierādījumi:
  - README linko uz `docs/DB_MIGRATION.md`.
  - `.gitignore:44` ignorē `docs/*`; izņēmumi ir tikai četri noteikumu/stratēģijas faili.
  - `git ls-files README.md docs\DB_MIGRATION.md` atgrieza tikai `README.md`.
  - `git check-ignore -v docs\DB_MIGRATION.md` apstiprināja, ka fails tiek ignorēts ar `.gitignore:44`.
- Kāpēc tas ir svarīgi: publiskā README saite būs salauzta klonā/repozitorijā, kur lokālie ignorētie dokumenti nav pievienoti.
- Ieteiktais labojums: vai nu versijēt `docs/DB_MIGRATION.md` un citus README linkotos dokumentus, vai no README izņemt/precizēt linkus uz lokāliem, nepublicējamiem materiāliem.
- Pārliecība: High.

### 10. Major: `project_context` ir novecojis un konfliktē ar pašreizējo kodu/README

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** `project_context/repo_overview.md` un
> `ai_rules.md` apraksta live multiplayer + persistence + PostgreSQL; "single-player
> only/disabled" formulējumi un load:local-placeholder apraksts novērsti (repo_overview
> rinda 9 un 40).

- Faili/rindas: `project_context/repo_overview.md:3-9`, `project_context/repo_overview.md:38`, `project_context/ai_rules.md:43-55`, `README.md:25-29`, `README.md:189-192`
- Pierādījumi:
  - `project_context/repo_overview.md:3-9` raksta par lokālu single-player projektu ar disabled multiplayer entry un bez database/deployment.
  - `project_context/ai_rules.md:54-55` saka: “The app is local single-player only” un “multiplayer button visible but disabled”.
  - README pašreiz apraksta multiplayer serveri, SQLite persistence, live multiplayer lobby/rooms un working locally.
  - `project_context/repo_overview.md:38` sauc `load:local` par placeholder, bet README to reklamē kā load-test rīku.
- Kāpēc tas ir svarīgi: AI/dokumentācijas navigācijas slānis dod pretrunīgas instrukcijas, kas var novest pie nepareiziem labojumiem, piemēram, nejaušas multiplayer atslēgšanas vai persistence neievērošanas.
- Ieteiktais labojums: pēc build stāvokļa sakārtošanas atjaunināt `project_context/*` no faktiskajiem avotiem un dzēst vai labot novecojušās “single-player only/disabled” instrukcijas.
- Pārliecība: High.

### 11. Minor: vecais `SessionRegistry` ir dead code

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** `apps/server/src/net/sessionRegistry.ts`
> ir dzēsts (commit 152a460). Vienīgā atlikusī atsauce ir `SessionManager.ts:43`
> docstring-komentārs, kas APZINĀTI kontrastē jauno pārvaldnieku ar veco reģistru
> (dizaina pamatojums, ne dzīvs imports) — to atstājam.

- Faili/rindas: `apps/server/src/net/sessionRegistry.ts:17-94`, `apps/server/src/sessions/SessionManager.ts:37-51`, `apps/server/src/net/WebSocketGateway.ts:15`, `apps/server/src/net/WebSocketGateway.ts:73-79`
- Pierādījumi:
  - `rg 'SessionRegistry|sessionRegistry' apps\server packages tools` atrod tikai pašu veco failu un komentāru jaunajā `SessionManager`.
  - `WebSocketGateway` importē un instancē `SessionManager`, ne `SessionRegistry`.
- Kāpēc tas ir svarīgi: vecs, neizmantots identitātes kods palielina uzturēšanas risku un var maldināt nākamos labojumus reconnect/session zonā.
- Ieteiktais labojums: dzēst `apps/server/src/net/sessionRegistry.ts`, ja nav ārpusrepo patērētāju; pirms dzēšanas palaist servera testus pēc importu problēmu labošanas.
- Pārliecība: High.

### 12. Minor: dokumentācijā un komentāros ir plašs mojibake/encoding bojājums

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** Mojibake sekvences (`â–¶`, `â€“`,
> `Äata` u.c.) nav atrodamas README, `packages/shared/src/serverEvents.ts` vai
> `.gitignore` — faili ir tīrs UTF-8.

- Faili/rindas: `README.md:8`, `README.md:28`, `README.md:67-75`, `.gitignore:35`, `packages/shared/src/serverEvents.ts:9`, `docs/TODO/TODO.md:1-4`
- Pierādījumi:
  - Tekstos redzamas sekvences `â–¶`, `2â€“4`, `â”Œ`, `Äata`, `Å†a`, nevis korekti Unicode simboli/latviešu burti.
- Kāpēc tas ir svarīgi: dokumentācija un koda komentāri ir grūti lasāmi, un README arhitektūras diagramma ir vizuāli bojāta.
- Ieteiktais labojums: atjaunot failus no korekta UTF-8 avota vai pārkodēt bojātos tekstus; pēc tam nodrošināt editor/CI pārbaudi, ka dokumentācijas faili paliek UTF-8.
- Pārliecība: High.

### 13. Minor: `lint` kvalitātes vārti nav definēti

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** Sakņu `package.json` satur
> `"lint": "eslint ."` (ESLint 9 flat config `eslint.config.mjs`: JS +
> typescript-eslint + React Hooks). `npm run lint` strādā un ir CI vārtos.

- Faili/rindas: `package.json:14-23`
- Pierādījumi:
  - Saknes `scripts` nesatur `lint`.
  - `npm run lint` atgrieza `Missing script: "lint"`.
- Kāpēc tas ir svarīgi: lietotājs prasīja lint pārbaudi, bet repozitorijam nav lint entrypoint. Tas nav runtime defekts, bet trūkst standartizēta stila/statiskās analīzes vārta.
- Ieteiktais labojums: ja projekts vēlas lint vārtus, pievienot konkrētu ESLint/Next lint konfigurāciju un saknes `lint` skriptu. Ja lint netiek lietots, dokumentēt, ka TypeScript/Vitest/Playwright ir vienīgie vārti.
- Pārliecība: High.

### 14. Minor: moderate dependency ievainojamība caur Next/PostCSS

> ⚠️ **Pārbaudīts 2026-06-06 — APSTIPRINĀTS; pieņemts/izsekojams (nav droša koda
> labojuma tagad).** `npm audit` joprojām rāda 2 moderate: `postcss <8.5.10` caur
> `next@16.2.6` iekšējo `node_modules/next/node_modules/postcss`. `npm audit fix
> --force` noraidīts (downgreidotu `next` → 9.3.3). `overrides: { postcss }` piespiež
> vite postcss uz patched, BET next iekšējo nepārresolvē bez pilnas lock-regenerācijas
> (nesamērīgs risks → atgriezts). Praktiskais risks zems: build-time CSS stringify
> XSS, šajā app nav neuzticama CSS ceļa. Pareizais labojums: mērķēts `next` upgrade uz
> versiju ar postcss ≥8.5.10, atsevišķā dependency-bump solī ar pilnu build/test.

- Faili/rindas: `apps/web/package.json:15`, `package-lock.json` Next/PostCSS ieraksti
- Pierādījumi:
  - `npm audit` un `npm audit --omit=dev` ziņo: `postcss <8.5.10`, GHSA `qx2v-qp2m-jg93`, caur `next`.
  - Audit norāda `2 moderate severity vulnerabilities`.
- Kāpēc tas ir svarīgi: PostCSS stringify XSS ievainojamība var būt būtiska, ja lietotāja kontrolēts CSS nonāk build/render ķēdē. Šajā repo tiešs ekspluatācijas ceļš netika apstiprināts, bet dependency audits to klasificē kā production dependency risku.
- Ieteiktais labojums: neatļaut `npm audit fix --force` akli, jo audits piedāvā breaking downgrade uz `next@9.3.3`. Tā vietā pārbaudīt Next/PostCSS pieejamo drošo versiju un atjaunināt ar mērķētu dependency upgrade, pēc tam palaist pilnu build/test komplektu.
- Pārliecība: Medium.

### 15. Minor: arhitektūras apgalvojums “klients nesatur spēles noteikumus” nav precīzs MP UI view-model failā

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** README (rindas 39–40) tagad precīzi
> saka, ka web klients drīkst izmantot `packages/core` "only for non-authoritative UI
> hints such as highlighting playable tiles" — atbilst implementācijai
> (`gameTableView.ts` `viewerValidTileKeys`). Serveris paliek autoritatīvs.

- Faili/rindas: `README.md:36-38`, `apps/web/lib/mp/MultiplayerClient.ts:67-69`, `apps/web/lib/mp/gameTableView.ts:1-2`, `apps/web/lib/mp/gameTableView.ts:206-231`
- Pierādījumi:
  - README saka, ka klienti “contain no game rules”.
  - `MultiplayerClient` komentārs atkārto, ka klients nesatur spēles noteikumu loģiku.
  - `gameTableView.ts` importē `canPlayTile`, `isTrump`, `trumpPriority` no `@domino-poker/core` un aprēķina `viewerValidTileKeys`.
- Kāpēc tas ir svarīgi: serveris joprojām ir autoritatīvs, tāpēc tas nav drošības defekts pats par sevi. Tomēr dokumentētais arhitektūras princips neatbilst implementācijai: klientā ir neautoritatīva legalitātes atspoguļošana UI vajadzībām. Ja core/server legalitāte mainās un klienta hints atpaliek, UI var maldinoši atspējot vai izcelt gājienus.
- Ieteiktais labojums: vai nu precizēt dokumentāciju (“klients var izmantot shared core tikai neautoritatīviem UI hints”), vai pārvietot legal-move hintus uz servera snapshot/protokolu.
- Pārliecība: High.

## Iespējamie riski

### R1. UI/layout regressions nav pārbaudāmas, kamēr web serveris nestartē

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** Pēc `.next` cache notīrīšanas
> `npm run test:web` palaiž visus 17 Playwright e2e (dialog-a11y, layout-regression,
> main-flow, storage-resilience) — visi zaļi (41.8s). Web serveris startē; Turbopack
> cache panika neatkārtojas.

- Faili/rindas: `playwright.config.ts`, `tests/e2e/*.spec.ts`, `apps/web/app/globals.css`
- Pierādījumi: `npm run test:web` beidzās ar Playwright webServer timeout un Turbopack cache paniku, pirms UI testi varēja izpildīties.
- Kāpēc tas ir svarīgi: auditā nevar apstiprināt vai noliegt layout problēmas, focus trap regressions vai e2e plūsmas bojājumus.
- Ieteiktais labojums: pēc dependency/build sakārtošanas notīrīt vai deterministiski pārbūvēt `.next` dev cache un palaist `npm run test:web`. Ja cache panika atkārtojas tīrā vidē, ziņot kā Next/Turbopack infrastruktūras defektu un apsvērt konfigurētu cache cleanup CI.
- Pārliecība: Medium.

### R2. Pašreizējie build artefakti ir stale/ignorēti un var maskēt vai radīt kļūdas

> ✅ **Pārbaudīts 2026-06-06 — MITIGĒTS.** CI (`.github/workflows/ci.yml`) palaiž
> `npm ci` no tīras vides + build + typecheck + lint + test + test:postgres — zaļš.
> Tas pierāda, ka rezultāts nav atkarīgs no stale lokāliem artefaktiem.

- Faili/rindas: `.gitignore:7-14`, `packages/core/dist`, `packages/shared/dist`, `apps/web/.next`
- Pierādījumi:
  - `.gitignore` ignorē `dist/` un `.next/`.
  - Darba kopijā eksistē `packages/shared/dist` ar veciem timestampiem no 2026-05-31, kamēr `packages/core/dist` tika pārrakstīts audita komandu laikā.
  - Build/test kļūdas rāda, ka sistēma reizēm paļaujas uz buildotiem workspace tipiem.
- Kāpēc tas ir svarīgi: lokālais rezultāts var atšķirties no tīra CI/clone rezultāta, jo ignorēti artefakti ietekmē module resolution.
- Ieteiktais labojums: validēt ar tīru checkout vai pēc drošas cache/build artefaktu notīrīšanas un `npm ci`. CI jāstartē no tīras vides.
- Pārliecība: Medium.

### R3. `node:sqlite` izmantošana prasa konkrētu Node versiju un rada eksperimentālus brīdinājumus

> ✅ **Pārbaudīts 2026-06-06 — ATRISINĀTS.** Node prasība fiksēta: `.nvmrc` /
> `.node-version` = 24, `engines.node >=22.5`, `.npmrc engine-strict=true`; CI lieto
> `node-version-file: .nvmrc`. `node:sqlite` ExperimentalWarning ir gaidīts un
> dokumentēts (ai_rules).

- Faili/rindas: `README.md:136-139`, `apps/server/src/storage/SqliteStorage.ts:1-5`
- Pierādījumi:
  - README prasa Node.js 22.5+ un iesaka Node 24.
  - `npm run test` izvadīja `ExperimentalWarning: SQLite is an experimental feature and might change at any time`.
- Kāpēc tas ir svarīgi: izvietošanas vide ar citu Node versiju vai mainīgu `node:sqlite` API var salauzt serveri.
- Ieteiktais labojums: fiksēt Node engine prasību `package.json` vai `.nvmrc`/Volta konfigurācijā un CI pārbaudīt tieši atbalstīto Node versiju.
- Pārliecība: Medium.

## Ko neizdevās verificēt

- Browser UI un layout reālos viewportos: `npm run test:web` netika līdz testiem.
- Pilns multiplayer lokālais smoke tests: `npm run dev:server` neuzbūvē serveri.
- Docker/systemd deploy ceļš: `deploy/Dockerfile` izpilda `npm run build`, kas pašlaik krīt.
- Reāla `domino-poker.com` live stāvokļa pārbaude: audits tika piesaistīts lokālajam repozitorijam un komandām, nevis ārējai vietnei.

