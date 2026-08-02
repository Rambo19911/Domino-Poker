// Publisko lapu redakcionālais saturs: “How to play”, stratēģija un “About”.
//
// Noteikumu AVOTS šeit nav: autoritatīvais SP teksts paliek `lib/locales/<code>.ts` atslēgās
// `rules*` (`rulesContent.ts` to tikai strukturē sekcijās, prozas tur nav), bet MP teksts —
// `mpRulesContent.ts`. Tikai tos lasa gan dialogs, gan `/[locale]/rules`. Šis
// modulis ir tam, kas noteikumos nav — īsa pamācība, stratēģijas skaidrojumi un projekta
// fakti.
//
// BET GODĪGI: pamācība un stratēģija nenovēršami PĀRSTĀSTA noteikumu faktus (trumpju
// secību, punktu skaitīšanu, 0-6 kārtulu) saviem vārdiem. Tas nav pārpublicējums, taču tas
// VAR novirzīties. Mainot noteikumus, pārskati arī šīs sadaļas. Daļēju aizsardzību dod
// `test/publicContent.test.ts` (prasa dzinēja PRECĪZO trumpju secību) un
// `test/coinRules.test.ts` (monētu skaitļi) — tie sedz skaitļus un secību, ne nozīmi.
//
// Modulis ir tīrs un serverim drošs: bez `window`, `localStorage`, hookiem un bez
// Markdown/MDX parsera (plāna D3: neieviest izpildlaika satura cauruļvadu).
//
// FAKTU PĀRBAUDE (2026-08-01): visi apgalvojumi par bezmaksas pieejamību, valūtu,
// režīmiem un botiem ir salīdzināti ar kodu, nevis ar `docs/*.md`:
//   - monētas nav nopērkamas un nav izmaksājamas — `apps/server/src/storage/CoinStore.ts`
//     virsraksti (`signup | sp_reward | mp_entry | mp_refund | mp_payout | admin_adjust |
//     theme_purchase | bot_purchase | daily_task_reward | weekly_task_reward | slot_bet |
//     slot_payout`) nesatur nevienu pirkuma iemeslu; maksājumu integrācijas nav;
//   - SP un BEZMAKSAS MP istabas darbojas bez konta; maksas istabas prasa pieteikšanos —
//     `apps/server/src/net/messageRouter.ts:309, 344-347`;
//   - MP istabā ir tieši 4 vietas — `apps/server/src/rooms/LobbyManager.ts:33`;
//   - SP ir 3 boti un 3 grūtības (Medium/Hard/Epic), bots darbojas pārlūkā Web Worker —
//     `apps/web/lib/bot/difficulty.ts`, `apps/web/lib/bot/botWorker.ts`.
//
// Stratēģijas saturs ir rakstīts pēc SPĒLES KODA (`packages/core/src/player.ts`,
// `dominoTile.ts`, `gameState.ts`), nevis pēc `docs/game_strategy.md`: tajā dokumentā
// vairāki apgalvojumi ir kļūdaini vai pārspīlēti (piem. “četri viena skaita kauliņi
// nozīmē, ka diviem pretiniekiem tā nav” — patiesībā garantē tikai vienu).

import { GITHUB_REPO_URL, type IndexedLocale } from "./site";

export interface HowToPlayStep {
  readonly title: string;
  readonly body: string;
}

export interface HowToPlayContent {
  readonly intro: string;
  readonly steps: readonly HowToPlayStep[];
  readonly fullRulesNote: string;
}

export interface ContentSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface StrategyContent {
  readonly intro: string;
  readonly sections: readonly ContentSection[];
  readonly disclaimer: string;
}

export interface HomeContent {
  readonly intro: string;
  readonly sections: readonly ContentSection[];
  readonly galleryHeading: string;
}

/** Ekrānattēls ar lokalizētu `alt` un redzamu parakstu. */
export interface PublicImage {
  readonly slug: string;
  readonly width: number;
  readonly height: number;
  /** Apraksts tiem, kas attēlu neredz. Nedublē redzamo parakstu. */
  readonly alt: string;
  /** Redzams paskaidrojošs teksts zem attēla. */
  readonly caption: string;
}

// Ģeometrija ir valodneatkarīga, tāpēc glabāta VIENU reizi: ja izmēri būtu pa valodām,
// tie laika gaitā atšķirtos. Faili: `public/images/<slug>-800.webp` un `-1440.webp`.
const SCREENSHOT_FILES = [
  { slug: "domino-poker-single-player-lobby", width: 1440, height: 971 },
  { slug: "domino-poker-bidding-phase", width: 1440, height: 791 },
  { slug: "domino-poker-trick-play", width: 1440, height: 757 }
] as const;

type ScreenshotSlug = (typeof SCREENSHOT_FILES)[number]["slug"];
type ScreenshotText = { readonly alt: string; readonly caption: string };

// Atslēgots pēc `slug`, nevis pēc secības: ja masīvu pārkārtotu, indeksu sapārošana
// klusi piešķirtu nepareizu tekstu nepareizajam attēlam. `Record` to padara neiespējamu.
const SCREENSHOT_TEXT: Record<IndexedLocale, Readonly<Record<ScreenshotSlug, ScreenshotText>>> = {
  en: {
    "domino-poker-single-player-lobby": {
      alt: "The Domino Poker lobby with the single-player and multiplayer dial, a round counter set to seven, and the player profile panel.",
      caption:
        "The lobby: pick single player or multiplayer, and choose how many rounds the match lasts."
    },
    "domino-poker-bidding-phase": {
      alt: "A single-player table during bidding, with the bid dialog open and the numbers 0 to 7 to choose from.",
      caption:
        "Bidding: every player commits to a number of tricks, from 0 to 7, before the first tile is played."
    },
    "domino-poker-trick-play": {
      alt: "A single-player table mid-trick, showing the trump marker, two played tiles in the centre and the player's own tiles along the bottom.",
      caption:
        "Trick play: the trump is marked in the centre, and your own tiles stay visible along the bottom edge."
    }
  },
  lv: {
    "domino-poker-single-player-lobby": {
      alt: "Domino Poker lobijs ar viena spēlētāja un daudzspēlētāju izvēles ripu, raundu skaitītāju uz septiņiem un spēlētāja profila paneli.",
      caption:
        "Lobijs: izvēlies viena spēlētāja vai daudzspēlētāju režīmu un to, cik raundu ilgs partija."
    },
    "domino-poker-bidding-phase": {
      alt: "Viena spēlētāja galds solīšanas laikā ar atvērtu solīšanas logu un izvēli no 0 līdz 7.",
      caption:
        "Solīšana: katrs spēlētājs pirms pirmā kauliņa piesaka stiķu skaitu no 0 līdz 7."
    },
    "domino-poker-trick-play": {
      alt: "Viena spēlētāja galds stiķa vidū: centrā redzama trumpja atzīme un divi izspēlēti kauliņi, bet gar apakšmalu — spēlētāja paša kauliņi.",
      caption:
        "Stiķu izspēle: trumpis ir atzīmēts centrā, un tavi kauliņi paliek redzami gar apakšmalu."
    }
  }
};

export function getScreenshots(locale: IndexedLocale): readonly PublicImage[] {
  const texts = SCREENSHOT_TEXT[locale];
  return SCREENSHOT_FILES.map((file) => ({ ...file, ...texts[file.slug] }));
}


export interface AboutFact {
  readonly label: string;
  readonly value: string;
}

export interface AboutContent {
  readonly intro: string;
  readonly facts: readonly AboutFact[];
  readonly coinsNote: string;
}

const HOW_TO_PLAY: Record<IndexedLocale, HowToPlayContent> = {
  en: {
    intro:
      "Domino Poker is a trick-taking game for four players. This is the short version — enough to sit down and play your first match.",
    steps: [
      {
        title: "Open the game",
        body: "Single-player and free multiplayer rooms work without an account. You only need to sign in to earn gold coins, keep statistics, or enter coin-entry rooms."
      },
      {
        title: "Pick a mode",
        body: "Single player deals you into a table with three bots at Medium, Hard or Epic difficulty. Multiplayer seats four players at a real-time table, and the host can fill empty seats with bots."
      },
      {
        title: "Choose the match length",
        body: "In single player you set how many rounds the match lasts. The player with the highest total score after the final round wins."
      },
      {
        title: "Bid",
        body: "Each player bids once, from 0 to 7, for how many tricks they expect to take. Your bid is not limited by what the others bid."
      },
      {
        title: "Play the seven tricks",
        body: "You must follow the number that was led if you hold it. If you do not hold it but you do hold a trump, you are forced to play the trump. The trumps are 0-0 and every tile containing a 1."
      },
      {
        title: "Read the score",
        body: "Matching your bid exactly is worth 15 points per trick. Taking more tricks than you bid replaces that with 5 points per trick. Falling short costs 5 points per missing trick. Bidding and taking all seven adds 50 bonus points; bidding seven and missing it costs 50."
      }
    ],
    fullRulesNote:
      "The full rules page covers the trump order, aces, the special 0-6 tile and the separate multiplayer table rules."
  },
  lv: {
    intro:
      "Domino Poker ir stiķu spēle četriem spēlētājiem. Šī ir īsā versija — pietiekami, lai apsēstos un nospēlētu pirmo partiju.",
    steps: [
      {
        title: "Atver spēli",
        body: "Viena spēlētāja režīms un bezmaksas daudzspēlētāju istabas darbojas bez konta. Pieteikties vajag tikai tad, ja gribi krāt zelta monētas, uzkrāt statistiku vai spēlēt istabās ar monētu dalības maksu."
      },
      {
        title: "Izvēlies režīmu",
        body: "Viena spēlētāja režīmā tu sēdies pie galda ar trim botiem — Medium, Hard vai Epic grūtībā. Daudzspēlētāju režīmā pie reāllaika galda ir četras vietas, un saimnieks tukšās var aizpildīt ar botiem."
      },
      {
        title: "Izvēlies partijas garumu",
        body: "Viena spēlētāja režīmā tu nosaki, cik raundu ilgst partija. Uzvar spēlētājs ar lielāko kopējo punktu skaitu pēc pēdējā raunda."
      },
      {
        title: "Solī",
        body: "Katrs spēlētājs vienu reizi piesaka no 0 līdz 7 stiķiem, ko cer paņemt. Tavu solījumu neierobežo tas, ko solījuši pārējie."
      },
      {
        title: "Izspēlē septiņus stiķus",
        body: "Ja tev ir izspēlētais skaitlis, tas ir jāizspēlē. Ja tā nav, bet rokā ir trumpis, tas ir jāuzliek — tā ir prasība, ne izvēle. Trumpji ir 0-0 un katrs kauliņš, kurā ir viens."
      },
      {
        title: "Nolasi rezultātu",
        body: "Precīzi izpildīts solījums dod 15 punktus par stiķi. Ja paņem vairāk, nekā solīji, tas nomaina bonusu ar 5 punktiem par stiķi. Par katru trūkstošo stiķi atņem 5 punktus. Solīt un paņemt visus septiņus dod +50 bonusa punktus; solīt septiņus un nepaņemt maksā -50."
      }
    ],
    fullRulesNote:
      "Pilno noteikumu lapā ir trumpju secība, dūži, īpašais 0-6 kauliņš un atsevišķie daudzspēlētāju galda noteikumi."
  }
};

const STRATEGY: Record<IndexedLocale, StrategyContent> = {
  en: {
    intro:
      "Domino Poker hides the other three hands, so every bid is a decision made on incomplete information. These are the tendencies worth betting on.",
    sections: [
      {
        heading: "Count trump rank, not trump quantity",
        paragraphs: [
          "The trumps are 0-0 plus every tile containing a 1 — eight in all: 0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0, in that order of strength. Note that 0-0 is a trump even though it holds no 1.",
          "0-0 can never be beaten, and 1-1 can only be beaten by 0-0. Four low trumps are worth far less than two high ones, because a player holding a stronger trump is compelled to play it over yours."
        ]
      },
      {
        heading: "The dealer bids last and leads first",
        paragraphs: [
          "Bidding starts to the dealer's left, so the dealer hears all three other bids before committing, and then leads the first trick.",
          "If you are the dealer, you have the most information at the table. If you are not, expect the first trick to be reactive rather than something you steer."
        ]
      },
      {
        heading: "Voids are what pull trumps out",
        paragraphs: [
          "There are only six non-trump tiles carrying each of 2, 3, 4, 5 and 6. Holding four of them guarantees that at least one opponent is void of that number, and if the last two sit in the same hand then two opponents are. Holding five guarantees two.",
          "An opponent who is void and still holds a trump is forced to trump, whether or not they wanted to spend it. Leading a number you hold in bulk is how you strip trumps off the table."
        ]
      },
      {
        heading: "An ace only wins if it matches the led number",
        paragraphs: [
          "Aces are 6-6, 5-5, 4-4, 3-3, 2-2 and 0-6 when it is played as a 0. An ace beats every other non-trump tile carrying the same number — but not a trump, and a tile that does not contain the led number cannot win the trick at all.",
          "Throwing 6-6 on a led 3 loses to any 3. Aces become reliable after the trumps have been drawn, not before."
        ]
      },
      {
        heading: "A bid of zero cannot lose you points",
        paragraphs: [
          "Bid 0 and take nothing and you score nothing. Bid 0 and take two tricks and you score 10.",
          "Zero is the one bid where extra tricks are pure profit, so there is no reason to throw away your strongest tiles just to stay clean."
        ]
      },
      {
        heading: "Overtricks are expensive, not free",
        paragraphs: [
          "Taking more tricks than you bid does not add to your score — it replaces it. Bid 3 and take exactly 3 and the hand is worth 45. Take 5 instead and the whole hand is worth 25.",
          "Once a non-zero bid is safe, the objective flips: your job for the rest of the round is to stop winning. A zero bid is the exception — there, every extra trick is still profit."
        ]
      },
      {
        heading: "You cannot always duck a trick",
        paragraphs: [
          "If a number is led that you do not hold and you still have a trump, the rules force you to play it — and that often wins a trick you were trying to avoid.",
          "Shedding is easier when you lead a low trump yourself: anyone holding a higher one is compelled to take it, which moves the lead away from you and thins the trumps at the same time."
        ]
      }
    ],
    disclaimer:
      "None of this guarantees a win. These are probabilities and table-reading habits, not rules that always hold."
  },
  lv: {
    intro:
      "Domino Poker slēpj pārējās trīs rokas, tāpēc katrs solījums ir lēmums ar nepilnīgu informāciju. Šīs ir tendences, ar kurām ir vērts rēķināties.",
    sections: [
      {
        heading: "Skaiti trumpju stiprumu, nevis skaitu",
        paragraphs: [
          "Trumpji ir 0-0 un katrs kauliņš, kurā ir viens — kopā astoņi: 0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0 tieši šādā stipruma secībā. Ievēro, ka 0-0 ir trumpis, lai gan tajā nav vieninieka.",
          "0-0 nevar pārsist neviens, un 1-1 var pārsist tikai 0-0. Četri vāji trumpji ir daudz mazāk vērti nekā divi stipri, jo spēlētājam ar stiprāku trumpi ir pienākums to uzlikt pāri tavējam."
        ]
      },
      {
        heading: "Dalītājs solī pēdējais un sāk pirmais",
        paragraphs: [
          "Solīšana sākas pa kreisi no dalītāja, tātad dalītājs izdzird visus trīs pārējos solījumus, pirms sola pats, un pēc tam sāk pirmo stiķi.",
          "Ja esi dalītājs, tev ir visvairāk informācijas pie galda. Ja neesi, pirmais stiķis būs drīzāk reakcija nekā tava izvēle."
        ]
      },
      {
        heading: "Tukšumi ir tas, kas izvelk trumpjus",
        paragraphs: [
          "Katram no skaitļiem 2, 3, 4, 5 un 6 ir tikai seši ne-trumpja kauliņi. Ja tev ir četri no tiem, vismaz vienam pretiniekam šī skaitļa nav, un, ja abi atlikušie ir vienās rokās, tad tā nav diviem. Pieci tavā rokā garantē divus.",
          "Pretiniekam, kuram skaitļa nav, bet ir trumpis, tas ir jāuzliek — neatkarīgi no tā, vai viņš to gribēja tērēt. Izspēlēt skaitli, kura tev ir daudz, ir veids, kā izvilkt trumpjus no galda."
        ]
      },
      {
        heading: "Dūzis uzvar tikai tad, ja sakrīt ar izspēlēto skaitli",
        paragraphs: [
          "Dūži ir 6-6, 5-5, 4-4, 3-3, 2-2 un 0-6, kad to izspēlē kā 0. Dūzis pārsit jebkuru citu ne-trumpja kauliņu ar to pašu skaitli — bet ne trumpi, un kauliņš, kurā izspēlētā skaitļa nav, stiķi nevar paņemt vispār.",
          "Uzmest 6-6 uz izspēlēta trijnieka nozīmē zaudēt jebkuram trijniekam. Dūži kļūst uzticami pēc tam, kad trumpji ir izvilkti, nevis pirms tam."
        ]
      },
      {
        heading: "Nulles solījums nevar atnest mīnusus",
        paragraphs: [
          "Solī 0 un nepaņem neko — iegūsti nulli. Solī 0 un paņem divus stiķus — iegūsti 10 punktus.",
          "Nulle ir vienīgais solījums, kur papildu stiķi ir tīra peļņa, tāpēc nav iemesla izmest savus stiprākos kauliņus tikai tīrības pēc."
        ]
      },
      {
        heading: "Pārliekie stiķi maksā dārgi, nevis ir bez maksas",
        paragraphs: [
          "Paņemt vairāk stiķu, nekā solīts, punktus nepieliek — tas tos nomaina. Solī 3 un paņem tieši 3, un raunds ir vērts 45. Paņem 5, un viss raunds ir vērts 25.",
          "Kad ne-nulles solījums ir izpildīts, mērķis apgriežas otrādi: atlikušajā raundā tavs uzdevums ir vairs neuzvarēt. Nulles solījums ir izņēmums — tur katrs papildu stiķis joprojām ir peļņa."
        ]
      },
      {
        heading: "No stiķa ne vienmēr var izvairīties",
        paragraphs: [
          "Ja izspēlē skaitli, kura tev nav, bet tev vēl ir trumpis, noteikumi liek to uzlikt — un tas bieži paņem tieši to stiķi, no kura centies izvairīties.",
          "Atbrīvoties ir vieglāk, ja pats izspēlē zemu trumpi: jebkuram ar stiprāku trumpi tas ir jāpārsit, tātad tu atdod vadību un vienlaikus retini trumpjus."
        ]
      }
    ],
    disclaimer:
      "Nekas no šī negarantē uzvaru. Tās ir varbūtības un galda lasīšanas iemaņas, nevis noteikumi, kas vienmēr izpildās."
  }
};

const ABOUT: Record<IndexedLocale, AboutContent> = {
  en: {
    intro:
      "Domino Poker is a free, open-source trick-taking domino game that runs in the browser. It is a personal project: there is no company behind it, no advertising, and nothing in it costs real money.",
    facts: [
      { label: "Author", value: "Rihards Laškovs" },
      { label: "Licence", value: "Apache-2.0" },
      { label: "Source code", value: GITHUB_REPO_URL },
      { label: "Platform", value: "Any modern browser; installable as a progressive web app" },
      {
        label: "Single player",
        value: "Three bots at Medium, Hard or Epic difficulty, running locally in your browser"
      },
      {
        label: "Multiplayer",
        value: "Real-time four-seat tables; the host can fill empty seats with bots"
      },
      {
        label: "Price",
        value: "Free — no real-money purchases, no subscriptions, no advertising"
      }
    ],
    coinsNote:
      "Gold coins are a virtual in-game currency. They are earned by playing and spent inside the game on cosmetic themes and optional coin-entry rooms. They cannot be bought, cannot be paid out, and have no real-world value."
  },
  lv: {
    intro:
      "Domino Poker ir bezmaksas, atvērtā pirmkoda stiķu domino spēle, kas darbojas pārlūkā. Tas ir personīgs projekts: aiz tā nav uzņēmuma, nav reklāmu, un nekas tajā nemaksā reālu naudu.",
    facts: [
      { label: "Autors", value: "Rihards Laškovs" },
      { label: "Licence", value: "Apache-2.0" },
      { label: "Pirmkods", value: GITHUB_REPO_URL },
      {
        label: "Platforma",
        value: "Jebkurš mūsdienu pārlūks; instalējama kā progresīvā tīmekļa lietotne"
      },
      {
        label: "Viens spēlētājs",
        value: "Trīs boti Medium, Hard vai Epic grūtībā, kas darbojas lokāli tavā pārlūkā"
      },
      {
        label: "Daudzspēlētāju režīms",
        value: "Reāllaika galdi ar četrām vietām; saimnieks tukšās vietas var aizpildīt ar botiem"
      },
      {
        label: "Cena",
        value: "Bez maksas — nav pirkumu par reālu naudu, nav abonementu, nav reklāmu"
      }
    ],
    coinsNote:
      "Zelta monētas ir virtuāla spēles valūta. Tās nopelna spēlējot un tērē spēles iekšienē — kosmētiskajām tēmām un neobligātajām istabām ar monētu dalības maksu. Tās nevar nopirkt, nevar izmaksāt, un tām nav reālas naudas vērtības."
  }
};

const HOME: Record<IndexedLocale, HomeContent> = {
  en: {
    intro:
      "Domino Poker is a trick-taking card-style game played with dominoes. Four players bid how many tricks they will win, then try to hit that bid exactly. It runs in the browser and costs nothing.",
    galleryHeading: "What the game looks like",
    sections: [
      {
        heading: "How a round works",
        paragraphs: [
          "A round uses a double-six domino set. Each of the four players is dealt seven tiles, bids from 0 to 7, and then plays out seven tricks.",
          "Points come from accuracy, not greed: matching your bid exactly is worth 15 points per trick, while overshooting it drops every trick to 5."
        ]
      },
      {
        heading: "Single player",
        paragraphs: [
          "Play against three bots at Medium, Hard or Epic difficulty. The bots run locally in your browser, and you choose how many rounds the match lasts.",
          "No account is needed to play single player."
        ]
      },
      {
        heading: "Multiplayer",
        paragraphs: [
          "Multiplayer seats four players at a real-time table. The host can fill empty seats with bots, and can start the match once all four seats are taken.",
          "Free rooms are open to everyone; rooms with a gold-coin entry fee require an account."
        ]
      }
    ]
  },
  lv: {
    intro:
      "Domino Poker ir stiķu spēle, ko spēlē ar domino kauliņiem. Četri spēlētāji piesaka, cik stiķus paņems, un tad cenšas savu solījumu izpildīt precīzi. Tā darbojas pārlūkā un neko nemaksā.",
    galleryHeading: "Kā spēle izskatās",
    sections: [
      {
        heading: "Kā norit raunds",
        paragraphs: [
          "Raundā izmanto dubultsešinieku domino komplektu. Katrs no četriem spēlētājiem saņem septiņus kauliņus, piesaka no 0 līdz 7 un pēc tam izspēlē septiņus stiķus.",
          "Punktus dod precizitāte, nevis alkatība: precīzi izpildīts solījums ir 15 punkti par stiķi, bet, pārsniedzot solījumu, par katru paņemto stiķi saņem tikai 5 punktus."
        ]
      },
      {
        heading: "Viens spēlētājs",
        paragraphs: [
          "Spēlē pret trim botiem Medium, Hard vai Epic grūtībā. Boti darbojas lokāli tavā pārlūkā, un tu izvēlies, cik raundu ilgst partija.",
          "Viena spēlētāja režīmam konts nav vajadzīgs."
        ]
      },
      {
        heading: "Daudzspēlētāju režīms",
        paragraphs: [
          "Daudzspēlētāju režīmā pie reāllaika galda ir četras vietas. Saimnieks tukšās vietas var aizpildīt ar botiem un var sākt partiju, kad visas četras vietas ir aizņemtas.",
          "Bezmaksas istabas ir pieejamas visiem; istabām ar zelta monētu dalības maksu vajag kontu."
        ]
      }
    ]
  }
};


export function getHome(locale: IndexedLocale): HomeContent {
  return HOME[locale];
}


export function getHowToPlay(locale: IndexedLocale): HowToPlayContent {
  return HOW_TO_PLAY[locale];
}

export function getStrategy(locale: IndexedLocale): StrategyContent {
  return STRATEGY[locale];
}

export function getAbout(locale: IndexedLocale): AboutContent {
  return ABOUT[locale];
}
