// Daudzspēlētāju (multiplayer) noteikumu dialoga saturs.
//
// Glabāts atsevišķi no plakanā i18n (lib/locales/*), jo `AppStrings` pieprasa, lai
// katra atslēga būtu `string`. Šis dokuments ir strukturēts (sekcijas + saraksti),
// tāpēc dzīvo šeit un tiek izvēlēts pēc `labels.localeCode`.

export type MpRuleBlock = string | { readonly list: readonly string[] };

export interface MpRuleSection {
  readonly title: string;
  readonly blocks: readonly MpRuleBlock[];
}

export interface MpRulesDoc {
  readonly intro: readonly string[];
  readonly sections: readonly MpRuleSection[];
}

const en: MpRulesDoc = {
  intro: [
    "This game is very dynamic and requires a good understanding of the rules of the game to be able to make decisions in a short time. For training, it is recommended to play Single play mode.",
    "Domino Poker multiplayer is a real-time four-seat table game. Each match uses a standard double-six domino set with 28 tiles, dealt as 7 tiles to each seat. The game can be played by four human players, or by a mix of humans and bots. A match can start only when all four seats are filled and at least one seat is occupied by a human player."
  ],
  sections: [
    {
      title: "Public and Private Rooms",
      blocks: [
        "Players can create either a public or private room.",
        "Public rooms are meant to be discoverable from the lobby. Other players can find them in the room list, open the room view, choose an empty seat, and join while the room is still waiting to start.",
        "Private rooms are intended for invited players. They still have normal room state and seats, but joining a private room requires the room code. A private room cannot be joined just by using its room id from the public lobby flow. The room code is shown in the room view and should be shared only with the players you want to invite.",
        "Both public and private rooms support the same game rules, same seat system, same bot-fill option, and same match flow. The difference is discoverability and join access: public rooms are lobby-joinable; private rooms require the code."
      ]
    },
    {
      title: "Room Seats and Host Controls",
      blocks: [
        "Each room has exactly four seats. The player who creates the room becomes the host and is placed in the first seat. Other players can join available seats while the room is waiting.",
        "The host can fill empty seats with bots. This allows a game to start even if fewer than four human players are available. The host is also the only player who can start the game.",
        "A game cannot start if any seat is still empty. If the host tries to start too early, the server rejects the start. The practical rule is simple: four occupied seats are required, humans or bots.",
        "If the host leaves while the room is still waiting, host ownership moves to another remaining human player. If no human players remain in a waiting room, the room is destroyed."
      ]
    },
    {
      title: "Gold Coins and Paid Rooms",
      blocks: [
        "Rooms can be free or paid. When creating a room, a logged-in host may set a gold entry fee — any amount up to their own balance (0 means a free room, which behaves exactly as before).",
        "Only registered, logged-in players can take a seat in a paid room: they have a gold balance. Anonymous players have no wallet, so they cannot join paid rooms, but they can still join free rooms.",
        "Every player pays the entry fee at the moment they take a seat, including the host. A seat can only be taken if the balance covers the fee. The collected fees form the room's prize pot.",
        "Before the game starts, money is fully refundable. If you leave your seat while the room is still waiting, the host deletes the waiting room, or the room expires before starting, your entry fee is returned to your balance.",
        "Once the game starts, the entry fee is no longer refundable. Leaving, forfeiting, or disconnecting during the match does not return your fee — it stays in the pot for the winners.",
        "When the match ends, the pot is split between the top two registered human players by total score: 70% to first place and 30% to second. Bots never receive a share, and players who forfeited are excluded. If only one registered human remains, that player takes the whole pot.",
        "If every human leaves and the match is abandoned without finishing, there is no winner, so the pot is not paid out.",
        "The balance you see updates live as you pay, get refunded, or win the pot. The server is always the authority on every coin movement."
      ]
    },
    {
      title: "One Room at a Time",
      blocks: [
        "A player can only be in one room at a time. If a player has already created or joined a room, the server will reject attempts to create another room or join a different one until that player leaves the current room, forfeits an active game, or the game ends and the room is cleaned up.",
        "This prevents one browser identity from occupying seats across multiple rooms at once.",
        "For local testing with multiple human players on one machine, each player needs a separate browser identity, such as different browsers or incognito/private windows."
      ]
    },
    {
      title: "Room Lifetime and TTL",
      blocks: [
        "Rooms have a time-to-live of 1 hour from creation.",
        "Waiting, starting, finished, or destroyed rooms are cleaned up after their TTL expires. The cleanup runs periodically, so removal may happen shortly after the exact expiry time rather than at the exact millisecond.",
        "Active in-game rooms are not destroyed just because the original TTL passes. If a match is already in progress, the room is allowed to finish. After the game ends, the server delivers the final game result and then destroys the room so players are free to create or join another room.",
        "If all human players disconnect from an active game, the server gives a short reconnect grace period. If no human returns during that grace period, the abandoned room is destroyed."
      ]
    },
    {
      title: "Starting the Game",
      blocks: [
        "When the host starts a full room, the server creates the authoritative game state and sends each seated human player their own personal game snapshot. Each player receives only their own hand. Opponents' hidden tiles are never sent to other players.",
        "After the room enters the game, there is a 10-second pre-game countdown before the first bidding turn begins. This gives players time to load the table before the real turn timer starts.",
        "This pre-game countdown is separate from the per-turn 10-second timer."
      ]
    },
    {
      title: "The 10-Second Turn Timer",
      blocks: [
        "Each human bid or move has its own 10-second server-controlled timer.",
        "The timer starts only when it is actually that human player's turn. If bots need to act before the next human, the server plays the bots first, with a short pacing delay, and only then starts the human player's 10-second countdown. This means a human player is not losing time while waiting for bot animations or bot turns to resolve.",
        "The server is the time authority. The client displays the countdown, but the server decides whether an action arrived before the deadline.",
        "If a player submits a bid or move before the deadline, the action is validated and accepted only if it is legal.",
        "If the action arrives after the deadline, the server rejects it as too late.",
        "If the timer expires and the player has not acted, the server automatically resolves the turn so the game never stalls:",
        {
          list: [
            "During bidding, the timeout bid is forced to a safe legal bid, normally 0.",
            "During tile play, the server chooses and plays a legal move for that player.",
            "If a trick is completed by the timeout move, the server resolves the trick winner and advances the game."
          ]
        },
        "Repeated missed turns affect the player's inactivity status. After the first missed turn the player is marked with a warning state. After the second, they are considered inactive. After the third, auto-play is enabled for that player. A returning player can resume and disable auto-play to regain manual control."
      ]
    },
    {
      title: "Disconnects and Reconnects",
      blocks: [
        "If a player disconnects during a game, their seat is not immediately removed. The game continues, and their future turns can be handled by the timeout system if they do not return in time.",
        "When the player reconnects with the same browser identity and reconnect token, the server restores their room, seat, connection state, and sends a fresh personal snapshot. That snapshot includes the current game state and, if a turn is active, the current turn deadline.",
        "If a player deliberately leaves during an active game, that is treated as a forfeit. Their seat becomes a bot seat, the player is returned to the lobby, and they cannot rejoin that same seat. The remaining players continue the match."
      ]
    },
    {
      title: "Bidding and Gameplay",
      blocks: [
        "Each round starts with bidding. Every player bids once, choosing how many of the 7 tricks they expect to win. Valid bids are 0 through 7.",
        "After all bids are placed, the play phase begins. Players play one domino per trick. The winner of each trick leads the next trick.",
        "The server validates every move. A client may highlight possible moves for convenience, but the client does not decide what is legal. The server rejects illegal moves, wrong-player moves, stale turn ids, and late actions."
      ]
    },
    {
      title: "Tile Rules",
      blocks: [
        "Trumps are the strongest tile group. From highest to lowest, the trump order is:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Aces are:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "The 0-6 tile has a special dual role. If it is played or required as 0, it behaves as an ace. If it is declared as 6, it behaves as a regular 6 tile.",
        "When leading a trick, a player may lead with any tile. If the led tile is not a trump or double, and it has two different numbers, the player must declare which number is being requested.",
        "When following a trick:",
        {
          list: [
            "If trump was led, players must play trump if they have one. If they have a stronger trump than the strongest trump already in the trick, they must play a stronger trump.",
            "If a number was requested, players must follow that number with a non-trump tile if possible.",
            "If they cannot follow the requested number, they must play trump if they have one.",
            "If they cannot follow and have no trump, they may discard any tile."
          ]
        }
      ]
    },
    {
      title: "Scoring",
      blocks: [
        "After 7 tricks, the round is scored by comparing each player's bid with the number of tricks they actually won.",
        {
          list: [
            "Exact bid: 15 points per bid trick.",
            "Exact bid of 7: 105 points plus a 50-point bonus.",
            "More tricks than bid: 5 points per trick won.",
            "Fewer tricks than bid: -5 points per missed trick.",
            "Failed bid of 7: -50 points."
          ]
        },
        "Round scores are added to the match total. After the configured number of rounds, the player with the highest total score wins. If needed, the game uses tie-breakers based on score, bid, tricks won, and seat order from the dealer."
      ]
    },
    {
      title: "Privacy and Fairness",
      blocks: [
        "The multiplayer server is authoritative. It owns the shuffled deck, the game state, the timer deadlines, legal move validation, scoring, and round progression.",
        "Each player receives only their own hand. Other players' hidden tiles are not included in their snapshots. Public information includes bids, tricks won, total scores, current trick, completed tricks, player statuses, and each player's remaining tile count.",
        "The multiplayer deal is generated from a server-side seed. This makes matches reproducible from the seed and event history, which helps with fairness checks, replay, debugging, and recovery."
      ]
    },
    {
      title: "Statistics",
      blocks: [
        "Statistics are counted only from multiplayer games where all four seats are taken by four distinct registered (logged-in) players."
      ]
    }
  ]
};

const lv: MpRulesDoc = {
  intro: [
    "Šī spēle ir ļoti dinamiska, un tai nepieciešama laba noteikumu izpratne, lai īsā laikā varētu pieņemt lēmumus. Treniņam ieteicams spēlēt viena spēlētāja režīmā.",
    "Domino Poker daudzspēlētāju režīms ir reāllaika spēle pie galda ar četrām vietām. Katrā spēlē izmanto standarta dubultsešinieku domino komplektu ar 28 kauliņiem, izdalot pa 7 kauliņiem katrai vietai. Spēlēt var četri cilvēki vai cilvēku un botu kombinācija. Spēle var sākties tikai tad, kad visas četras vietas ir aizpildītas un vismaz vienā vietā sēž cilvēks."
  ],
  sections: [
    {
      title: "Publiskās un privātās istabas",
      blocks: [
        "Spēlētāji var izveidot vai nu publisku, vai privātu istabu.",
        "Publiskās istabas ir paredzētas atrašanai no lobija. Citi spēlētāji var tās atrast istabu sarakstā, atvērt istabas skatu, izvēlēties brīvu vietu un pievienoties, kamēr istaba vēl gaida sākšanu.",
        "Privātās istabas ir paredzētas uzaicinātiem spēlētājiem. Tām ir tāds pats istabas stāvoklis un vietas, taču, lai pievienotos privātai istabai, nepieciešams istabas kods. Privātai istabai nevar pievienoties, vienkārši izmantojot tās istabas ID no publiskā lobija. Istabas kods tiek rādīts istabas skatā, un to vajadzētu dot tikai tiem spēlētājiem, kurus vēlies uzaicināt.",
        "Gan publiskās, gan privātās istabās ir vieni un tie paši spēles noteikumi, viena un tā pati vietu sistēma, viena un tā pati botu aizpildes iespēja un viena un tā pati spēles gaita. Atšķiras tikai atrodamība un pievienošanās: publiskām istabām var pievienoties no lobija; privātām nepieciešams kods."
      ]
    },
    {
      title: "Istabas vietas un saimnieka vadība",
      blocks: [
        "Katrā istabā ir tieši četras vietas. Spēlētājs, kurš izveido istabu, kļūst par saimnieku un tiek nosēdināts pirmajā vietā. Citi spēlētāji var ieņemt brīvās vietas, kamēr istaba gaida.",
        "Saimnieks var aizpildīt brīvās vietas ar botiem. Tas ļauj sākt spēli pat tad, ja pieejami mazāk par četriem cilvēkiem. Saimnieks ir arī vienīgais spēlētājs, kurš var sākt spēli.",
        "Spēli nevar sākt, ja kāda vieta vēl ir brīva. Ja saimnieks mēģina sākt par agru, serveris sākšanu noraida. Praktiskais noteikums ir vienkāršs: nepieciešamas četras aizņemtas vietas — cilvēki vai boti.",
        "Ja saimnieks aiziet, kamēr istaba vēl gaida, saimnieka tiesības pāriet citam atlikušajam cilvēkam. Ja gaidošā istabā nepaliek neviena cilvēka, istaba tiek likvidēta."
      ]
    },
    {
      title: "Zelta monētas un maksas istabas",
      blocks: [
        "Istabas var būt bezmaksas vai maksas. Veidojot istabu, ielogots saimnieks var noteikt zelta dalības maksu — jebkuru summu līdz savai bilancei (0 nozīmē bezmaksas istabu, kas darbojas tieši tāpat kā līdz šim).",
        "Maksas istabā vietu var ieņemt tikai reģistrēti, ielogoti spēlētāji: viņiem ir zelta bilance. Anonīmiem spēlētājiem nav maka, tāpēc viņi nevar pievienoties maksas istabām, bet joprojām var pievienoties bezmaksas istabām.",
        "Katrs spēlētājs samaksā dalības maksu brīdī, kad ieņem vietu, ieskaitot saimnieku. Vietu var ieņemt tikai tad, ja bilance sedz maksu. Savāktās maksas veido istabas balvas podu.",
        "Pirms spēles sākuma nauda ir pilnībā atmaksājama. Ja pamet savu vietu, kamēr istaba vēl gaida, saimnieks dzēš gaidošo istabu vai istabai beidzas laiks pirms sākuma, dalības maksa tiek atgriezta tavā bilancē.",
        "Tiklīdz spēle sākusies, dalības maksa vairs netiek atmaksāta. Aiziešana, atteikšanās vai atvienošanās spēles laikā maksu neatgriež — tā paliek podā uzvarētājiem.",
        "Kad spēle beidzas, pods tiek sadalīts starp diviem augstāk novērtētajiem reģistrētajiem cilvēkiem pēc kopējiem punktiem: 70% pirmajai vietai un 30% otrajai. Boti nekad nesaņem daļu, un forfeitējušie spēlētāji tiek izslēgti. Ja paliek tikai viens reģistrēts cilvēks, viņš saņem visu podu.",
        "Ja visi cilvēki aiziet un spēle tiek pamesta, to nepabeidzot, uzvarētāja nav, tāpēc pods netiek izmaksāts.",
        "Redzamā bilance atjaunojas dzīvajā, kad maksā, saņem atmaksu vai laimē podu. Serveris vienmēr ir autoritāte par katru monētu kustību."
      ]
    },
    {
      title: "Viena istaba vienlaikus",
      blocks: [
        "Spēlētājs vienlaikus var atrasties tikai vienā istabā. Ja spēlētājs jau ir izveidojis vai pievienojies istabai, serveris noraidīs mēģinājumus izveidot citu istabu vai pievienoties citai, kamēr šis spēlētājs nepamet pašreizējo istabu, neatsakās no aktīvas spēles vai spēle nebeidzas un istaba netiek sakopta.",
        "Tas neļauj vienai pārlūka identitātei vienlaikus ieņemt vietas vairākās istabās.",
        "Lokālai testēšanai ar vairākiem cilvēkiem vienā datorā katram spēlētājam nepieciešama atsevišķa pārlūka identitāte, piemēram, dažādi pārlūki vai inkognito/privātie logi."
      ]
    },
    {
      title: "Istabas dzīves ilgums un TTL",
      blocks: [
        "Istabām ir dzīvotspējas laiks (TTL) — 1 stunda no izveidošanas brīža.",
        "Gaidošās, sāktās, pabeigtās vai likvidētās istabas tiek sakoptas pēc to TTL beigām. Sakopšana notiek periodiski, tāpēc noņemšana var notikt īsi pēc precīzā beigu laika, nevis tieši milisekundē.",
        "Aktīvas spēlē esošas istabas netiek likvidētas tikai tāpēc, ka pagājis sākotnējais TTL. Ja spēle jau norit, istabai ļauj pabeigties. Pēc spēles beigām serveris piegādā gala rezultātu un tad likvidē istabu, lai spēlētāji būtu brīvi izveidot vai pievienoties citai istabai.",
        "Ja no aktīvas spēles atvienojas visi cilvēki, serveris dod īsu atkārtotas pieslēgšanās žēlastības laiku. Ja šajā laikā neviens cilvēks neatgriežas, pamestā istaba tiek likvidēta."
      ]
    },
    {
      title: "Spēles sākšana",
      blocks: [
        "Kad saimnieks sāk pilnu istabu, serveris izveido autoritatīvo spēles stāvokli un katram nosēdinātajam cilvēkam nosūta viņa personīgo spēles momentuzņēmumu. Katrs spēlētājs saņem tikai savu roku. Pretinieku slēptie kauliņi citiem spēlētājiem nekad netiek nosūtīti.",
        "Pēc tam, kad istaba ieiet spēlē, pirms pirmā solīšanas gājiena notiek 10 sekunžu atpakaļskaitīšana. Tā dod spēlētājiem laiku ielādēt galdu, pirms sākas īstais gājiena taimeris.",
        "Šī pirmsspēles atpakaļskaitīšana ir atsevišķa no katra gājiena 10 sekunžu taimera."
      ]
    },
    {
      title: "10 sekunžu gājiena taimeris",
      blocks: [
        "Katram cilvēka solījumam vai gājienam ir savs 10 sekunžu servera kontrolēts taimeris.",
        "Taimeris sākas tikai tad, kad patiešām ir attiecīgā cilvēka gājiens. Ja pirms nākamā cilvēka jārīkojas botiem, serveris vispirms izspēlē botus ar nelielu ritma aizturi un tikai tad sāk cilvēka 10 sekunžu atpakaļskaitīšanu. Tas nozīmē, ka cilvēks nezaudē laiku, gaidot botu animācijas vai botu gājienu izpildi.",
        "Serveris ir laika autoritāte. Klients rāda atpakaļskaitīšanu, bet serveris izlemj, vai darbība pienāca pirms termiņa.",
        "Ja spēlētājs iesniedz solījumu vai gājienu pirms termiņa, darbība tiek pārbaudīta un pieņemta tikai tad, ja tā ir likumīga.",
        "Ja darbība pienāk pēc termiņa, serveris to noraida kā novēlotu.",
        "Ja taimeris beidzas un spēlētājs nav rīkojies, serveris automātiski atrisina gājienu, lai spēle nekad neapstātos:",
        {
          list: [
            "Solīšanas laikā novēlotais solījums tiek piespiedu kārtā uzstādīts uz drošu likumīgu solījumu, parasti 0.",
            "Kauliņu izspēles laikā serveris izvēlas un izspēlē likumīgu gājienu šim spēlētājam.",
            "Ja ar novēloto gājienu tiek pabeigts stiķis, serveris nosaka stiķa uzvarētāju un virza spēli uz priekšu."
          ]
        },
        "Atkārtoti nokavēti gājieni ietekmē spēlētāja neaktivitātes statusu. Pēc pirmā nokavētā gājiena spēlētājs tiek atzīmēts ar brīdinājuma stāvokli. Pēc otrā viņš tiek uzskatīts par neaktīvu. Pēc trešā šim spēlētājam tiek ieslēgta automātiskā spēle. Atgriezies spēlētājs var turpināt un izslēgt automātisko spēli, lai atgūtu manuālu vadību."
      ]
    },
    {
      title: "Atvienošanās un atkārtota pieslēgšanās",
      blocks: [
        "Ja spēlētājs spēles laikā atvienojas, viņa vieta netiek uzreiz noņemta. Spēle turpinās, un viņa nākamos gājienus var apstrādāt taimauta sistēma, ja viņš laikā neatgriežas.",
        "Kad spēlētājs atkārtoti pieslēdzas ar to pašu pārlūka identitāti un atkārtotās pieslēgšanās marķieri, serveris atjauno viņa istabu, vietu, savienojuma stāvokli un nosūta svaigu personīgo momentuzņēmumu. Šis momentuzņēmums ietver pašreizējo spēles stāvokli un, ja gājiens ir aktīvs, pašreizējo gājiena termiņu.",
        "Ja spēlētājs apzināti aiziet aktīvas spēles laikā, tas tiek uzskatīts par atteikšanos. Viņa vieta kļūst par bota vietu, spēlētājs tiek atgriezts lobijā un nevar atkal ieņemt to pašu vietu. Atlikušie spēlētāji turpina spēli."
      ]
    },
    {
      title: "Solīšana un spēles gaita",
      blocks: [
        "Katrs raunds sākas ar solīšanu. Katrs spēlētājs solī vienu reizi, izvēloties, cik no 7 stiķiem viņš plāno paņemt. Derīgi solījumi ir no 0 līdz 7.",
        "Kad visi solījumi ir izdarīti, sākas izspēles fāze. Spēlētāji izspēlē vienu kauliņu katrā stiķī. Katra stiķa uzvarētājs sāk nākamo stiķi.",
        "Serveris pārbauda katru gājienu. Klients ērtības labad var izcelt iespējamos gājienus, taču klients neizlemj, kas ir likumīgs. Serveris noraida nelikumīgus gājienus, nepareiza spēlētāja gājienus, novecojušus gājiena ID un novēlotas darbības."
      ]
    },
    {
      title: "Kauliņu noteikumi",
      blocks: [
        "Trumpji ir stiprākā kauliņu grupa. No stiprākā uz vājāko trumpju secība ir:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Dūži ir:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Kauliņam 0-6 ir īpaša divkārša loma. Ja to izspēlē vai pieprasa kā 0, tas darbojas kā dūzis. Ja to piesaka kā 6, tas darbojas kā parasts sešinieks.",
        "Sākot stiķi, spēlētājs drīkst iziet ar jebkuru kauliņu. Ja izietais kauliņš nav trumpis vai dubultnieks un tam ir divi dažādi skaitļi, spēlētājam jāpiesaka, kurš skaitlis tiek pieprasīts.",
        "Sekojot stiķī:",
        {
          list: [
            "Ja iziets trumpis, spēlētājiem jāliek trumpis, ja tāds ir. Ja viņiem ir stiprāks trumpis nekā stiprākais stiķī jau esošais trumpis, viņiem jāliek stiprāks trumpis.",
            "Ja pieprasīts skaitlis, spēlētājiem, ja iespējams, jāseko šim skaitlim ar ne-trumpja kauliņu.",
            "Ja viņi nevar sekot pieprasītajam skaitlim, viņiem jāliek trumpis, ja tāds ir.",
            "Ja viņi nevar sekot un trumpja nav, viņi drīkst atmest jebkuru kauliņu."
          ]
        }
      ]
    },
    {
      title: "Punktu skaitīšana",
      blocks: [
        "Pēc 7 stiķiem raunds tiek novērtēts, salīdzinot katra spēlētāja solījumu ar faktiski paņemto stiķu skaitu.",
        {
          list: [
            "Precīzs solījums: 15 punkti par katru solīto stiķi.",
            "Precīzs solījums 7: 105 punkti plus 50 punktu bonuss.",
            "Vairāk stiķu nekā solīts: 5 punkti par katru paņemto stiķi.",
            "Mazāk stiķu nekā solīts: -5 punkti par katru trūkstošo stiķi.",
            "Neizpildīts solījums 7: -50 punkti."
          ]
        },
        "Raunda punkti tiek pieskaitīti spēles kopsummai. Pēc noteiktā raundu skaita uzvar spēlētājs ar lielāko kopējo punktu skaitu. Ja nepieciešams, spēle izmanto izšķiršanas kritērijus pēc punktiem, solījuma, paņemtajiem stiķiem un vietu secības no dalītāja."
      ]
    },
    {
      title: "Privātums un godīgums",
      blocks: [
        "Daudzspēlētāju serveris ir autoritatīvs. Tam pieder sajauktā kava, spēles stāvoklis, taimera termiņi, likumīgo gājienu pārbaude, punktu skaitīšana un raundu virzība.",
        "Katrs spēlētājs saņem tikai savu roku. Citu spēlētāju slēptie kauliņi nav iekļauti viņu momentuzņēmumos. Publiskā informācija ietver solījumus, paņemtos stiķus, kopējos punktus, pašreizējo stiķi, pabeigtos stiķus, spēlētāju statusus un katra spēlētāja atlikušo kauliņu skaitu.",
        "Daudzspēlētāju dalīšana tiek ģenerēta no servera puses sēklas. Tas padara spēles atkārtojamas no sēklas un notikumu vēstures, kas palīdz godīguma pārbaudēs, atkārtošanā, atkļūdošanā un atjaunošanā."
      ]
    },
    {
      title: "Statistika",
      blocks: [
        "Statistika tiek uzskaitīta tikai no Multiplayer spēlēm, kurās visas 4 vietas aizņem atšķirīgi reģistrēti (ielogoti) spēlētāji."
      ]
    }
  ]
};

export const mpRulesContent: Readonly<Record<string, MpRulesDoc>> = { en, lv };

export function getMpRulesDoc(localeCode: string): MpRulesDoc {
  return mpRulesContent[localeCode] ?? en;
}
