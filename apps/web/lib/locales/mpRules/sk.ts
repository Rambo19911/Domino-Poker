import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesSk: MpRulesDoc = {
  intro: [
    "Táto hra je veľmi dynamická a vyžaduje dobré pochopenie pravidiel, aby ste dokázali robiť rozhodnutia v krátkom čase. Na tréning sa odporúča hrať režim pre jedného hráča.",
    "Domino Poker pre viac hráčov je hra pri stole so štyrmi miestami v reálnom čase. Každý zápas používa štandardnú súpravu dvojšestkového domina s 28 kameňmi, rozdanými po 7 kameňoch na každé miesto. Hru môžu hrať štyria ľudskí hráči alebo kombinácia ľudí a počítačov. Zápas sa môže začať len vtedy, keď sú obsadené všetky štyri miesta a aspoň jedno miesto obsadzuje ľudský hráč."
  ],
  sections: [
    {
      title: "Verejné a súkromné miestnosti",
      blocks: [
        "Hráči môžu vytvoriť buď verejnú, alebo súkromnú miestnosť.",
        "Verejné miestnosti sú určené na to, aby ich bolo možné nájsť z predsiene. Ostatní hráči ich môžu nájsť v zozname miestností, otvoriť zobrazenie miestnosti, vybrať si voľné miesto a pripojiť sa, kým miestnosť ešte čaká na začiatok.",
        "Súkromné miestnosti sú určené pre pozvaných hráčov. Majú stále bežný stav miestnosti a miesta, ale pripojenie do súkromnej miestnosti vyžaduje kód miestnosti. Do súkromnej miestnosti sa nedá pripojiť len pomocou jej ID miestnosti z postupu vo verejnej predsieni. Kód miestnosti sa zobrazuje v zobrazení miestnosti a mal by sa zdieľať len s hráčmi, ktorých chcete pozvať.",
        "Verejné aj súkromné miestnosti podporujú rovnaké pravidlá hry, rovnaký systém miest, rovnakú možnosť doplnenia počítačmi a rovnaký priebeh zápasu. Rozdiel je v nájditeľnosti a prístupe pri pripájaní: do verejných miestností sa dá pripojiť z predsiene; súkromné vyžadujú kód."
      ]
    },
    {
      title: "Miesta v miestnosti a ovládanie hostiteľom",
      blocks: [
        "Každá miestnosť má presne štyri miesta. Hráč, ktorý vytvorí miestnosť, sa stáva hostiteľom a je umiestnený na prvé miesto. Ostatní hráči sa môžu pripojiť na voľné miesta, kým miestnosť čaká.",
        "Hostiteľ môže doplniť voľné miesta počítačmi. To umožňuje začať hru aj vtedy, keď je k dispozícii menej ako štyria ľudskí hráči. Hostiteľ je zároveň jediný hráč, ktorý môže spustiť hru.",
        "Hru nemožno spustiť, ak je niektoré miesto stále voľné. Ak sa hostiteľ pokúsi spustiť hru priskoro, server spustenie odmietne. Praktické pravidlo je jednoduché: vyžadujú sa štyri obsadené miesta, či už ľuďmi alebo počítačmi.",
        "Ak hostiteľ odíde, kým miestnosť ešte čaká, vlastníctvo hostiteľa prejde na iného zostávajúceho ľudského hráča. Ak v čakajúcej miestnosti nezostane žiadny ľudský hráč, miestnosť sa zruší."
      ]
    },
    {
      title: "Zlaté mince a platené miestnosti",
      blocks: [
        "Miestnosti môžu byť bezplatné alebo platené. Pri vytváraní miestnosti môže prihlásený hostiteľ nastaviť vstupný poplatok v zlate — akúkoľvek sumu až do výšky vlastného zostatku (0 znamená bezplatnú miestnosť, ktorá sa správa presne ako predtým).",
        "Miesto v platenej miestnosti môžu obsadiť len registrovaní, prihlásení hráči: majú zostatok zlata. Anonymní hráči nemajú peňaženku, takže sa nemôžu pripojiť do platených miestností, ale stále sa môžu pripojiť do bezplatných miestností.",
        "Každý hráč zaplatí vstupný poplatok vo chvíli, keď obsadí miesto, vrátane hostiteľa. Miesto možno obsadiť len vtedy, ak zostatok pokryje poplatok. Vybrané poplatky tvoria výherný bank miestnosti.",
        "Pred začiatkom hry sú peniaze plne vratné. Ak opustíte svoje miesto, kým miestnosť ešte čaká, hostiteľ vymaže čakajúcu miestnosť alebo miestnosti vyprší platnosť pred začiatkom, váš vstupný poplatok sa vráti na váš zostatok.",
        "Hneď ako sa hra začne, vstupný poplatok už nie je vratný. Odchod, vzdanie sa alebo odpojenie počas zápasu váš poplatok nevráti — zostáva v banku pre výhercov.",
        "Keď zápas skončí, bank sa rozdelí medzi dvoch najlepších registrovaných ľudských hráčov podľa celkového skóre: 70% na prvé miesto a 30% na druhé. Počítače nikdy nedostanú podiel a hráči, ktorí sa vzdali, sú vylúčení. Ak zostane len jeden registrovaný človek, tento hráč získa celý bank.",
        "Ak odídu všetci ľudia a zápas sa opustí bez dokončenia, niet víťaza, takže sa bank nevyplatí.",
        "Zostatok, ktorý vidíte, sa aktualizuje naživo, keď platíte, dostávate refundáciu alebo vyhrávate bank. Server je vždy autoritou pre každý pohyb mincí."
      ]
    },
    {
      title: "Jedna miestnosť naraz",
      blocks: [
        "Hráč môže byť naraz len v jednej miestnosti. Ak hráč už vytvoril miestnosť alebo sa do nej pripojil, server odmietne pokusy vytvoriť ďalšiu miestnosť alebo sa pripojiť do inej, kým tento hráč neopustí aktuálnu miestnosť, nevzdá sa aktívnej hry alebo hra neskončí a miestnosť sa neupratá.",
        "Tým sa zabráni tomu, aby jedna identita prehliadača obsadzovala miesta vo viacerých miestnostiach naraz.",
        "Pri lokálnom testovaní s viacerými ľudskými hráčmi na jednom počítači potrebuje každý hráč samostatnú identitu prehliadača, napríklad rôzne prehliadače alebo inkognito/súkromné okná."
      ]
    },
    {
      title: "Životnosť miestnosti a TTL",
      blocks: [
        "Miestnosti majú životnosť 1 hodinu od vytvorenia.",
        "Čakajúce, spúšťajúce sa, dokončené alebo zrušené miestnosti sa upracú po vypršaní ich TTL. Upratovanie prebieha pravidelne, takže odstránenie môže nastať krátko po presnom čase vypršania, nie presne na milisekundu.",
        "Aktívne rozohraté miestnosti sa nezrušia len preto, že uplynulo pôvodné TTL. Ak už zápas prebieha, miestnosti sa umožní dohrať. Po skončení hry server doručí konečný výsledok hry a potom miestnosť zruší, aby hráči mohli voľne vytvoriť alebo sa pripojiť do inej miestnosti.",
        "Ak sa od aktívnej hry odpoja všetci ľudskí hráči, server poskytne krátku lehotu na opätovné pripojenie. Ak sa počas tejto lehoty nevráti žiadny človek, opustená miestnosť sa zruší."
      ]
    },
    {
      title: "Spustenie hry",
      blocks: [
        "Keď hostiteľ spustí plnú miestnosť, server vytvorí autoritatívny stav hry a každému usadenému ľudskému hráčovi pošle jeho vlastnú osobnú snímku hry. Každý hráč dostane len svoju vlastnú ruku. Skryté kamene súperov sa ostatným hráčom nikdy neposielajú.",
        "Keď miestnosť vstúpi do hry, pred prvým kolom hlášok prebehne 10-sekundový predzápasový odpočet. Ten dáva hráčom čas načítať stôl skôr, než sa spustí skutočný časovač ťahu.",
        "Tento predzápasový odpočet je oddelený od 10-sekundového časovača pre jednotlivé ťahy."
      ]
    },
    {
      title: "10-sekundový časovač ťahu",
      blocks: [
        "Každá ľudská hláška alebo ťah má vlastný 10-sekundový časovač ovládaný serverom.",
        "Časovač sa spustí len vtedy, keď je skutočne na ťahu daný ľudský hráč. Ak musia pred ďalším človekom konať počítače, server najprv odohrá počítače s krátkym časovým oneskorením a až potom spustí 10-sekundový odpočet ľudského hráča. To znamená, že ľudský hráč nestráca čas čakaním na animácie počítačov alebo na vyriešenie ťahov počítačov.",
        "Server je autoritou pre čas. Klient zobrazuje odpočet, ale server rozhoduje, či akcia dorazila pred uplynutím lehoty.",
        "Ak hráč odošle hlášku alebo ťah pred uplynutím lehoty, akcia sa overí a prijme len vtedy, ak je legálna.",
        "Ak akcia dorazí po uplynutí lehoty, server ju odmietne ako oneskorenú.",
        "Ak časovač vyprší a hráč nekonal, server automaticky vyrieši ťah, aby sa hra nikdy nezastavila:",
        {
          list: [
            "Počas hlášok sa oneskorená hláška nastaví na bezpečnú legálnu hlášku, zvyčajne 0.",
            "Počas hrania kameňov server vyberie a zahrá legálny ťah za daného hráča.",
            "Ak sa oneskoreným ťahom dokončí zdvih, server určí víťaza zdvihu a posunie hru ďalej."
          ]
        },
        "Opakovane zmeškané ťahy ovplyvňujú stav neaktivity hráča. Po prvom zmeškanom ťahu sa hráč označí stavom varovania. Po druhom sa považuje za neaktívneho. Po treťom sa pre tohto hráča zapne automatická hra. Vrátený hráč môže pokračovať a vypnúť automatickú hru, aby získal späť manuálne ovládanie."
      ]
    },
    {
      title: "Odpojenia a opätovné pripojenia",
      blocks: [
        "Ak sa hráč odpojí počas hry, jeho miesto sa hneď neodstráni. Hra pokračuje a jeho budúce ťahy môže spracovať systém vypršania lehoty, ak sa včas nevráti.",
        "Keď sa hráč opätovne pripojí s rovnakou identitou prehliadača a tokenom opätovného pripojenia, server obnoví jeho miestnosť, miesto, stav pripojenia a pošle čerstvú osobnú snímku. Táto snímka obsahuje aktuálny stav hry a, ak je ťah aktívny, aktuálnu lehotu ťahu.",
        "Ak hráč zámerne odíde počas aktívnej hry, považuje sa to za vzdanie sa. Jeho miesto sa stane miestom počítača, hráč sa vráti do predsiene a nemôže sa znova vrátiť na to isté miesto. Zostávajúci hráči v zápase pokračujú."
      ]
    },
    {
      title: "Hlášky a priebeh hry",
      blocks: [
        "Každé kolo sa začína hláškami. Každý hráč vyhlási raz a vyberie, koľko zo 7 zdvihov očakáva vyhrať. Platné hlášky sú od 0 do 7.",
        "Po vyhlásení všetkých hlášok sa začína fáza hrania. Hráči zahrajú jeden domino kameň za zdvih. Víťaz každého zdvihu vynáša do nasledujúceho zdvihu.",
        "Server overuje každý ťah. Klient môže pre pohodlie zvýrazniť možné ťahy, ale klient nerozhoduje o tom, čo je legálne. Server odmieta nelegálne ťahy, ťahy nesprávneho hráča, neaktuálne ID ťahov a oneskorené akcie."
      ]
    },
    {
      title: "Pravidlá kameňov",
      blocks: [
        "Tromfy sú najsilnejšia skupina kameňov. Od najsilnejšieho po najslabší je poradie tromfov:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Esá sú:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Kameň 0-6 má osobitnú dvojakú úlohu. Ak sa hrá alebo požaduje ako 0, správa sa ako eso. Ak je vyhlásený ako 6, správa sa ako bežný kameň 6.",
        "Pri vynesení do zdvihu môže hráč vyniesť ľubovoľný kameň. Ak vynesený kameň nie je tromf ani dvojica a má dve rôzne čísla, hráč musí vyhlásiť, ktoré číslo sa požaduje.",
        "Pri nasledovaní v zdvihu:",
        {
          list: [
            "Ak sa vyniesol tromf, hráči musia zahrať tromf, ak ho majú. Ak majú silnejší tromf než najsilnejší tromf, ktorý už je v zdvihu, musia zahrať silnejší tromf.",
            "Ak sa požadovalo číslo, hráči musia toto číslo nasledovať netromfovým kameňom, ak je to možné.",
            "Ak nemôžu nasledovať požadované číslo, musia zahrať tromf, ak ho majú.",
            "Ak nemôžu nasledovať a nemajú tromf, môžu odhodiť ľubovoľný kameň."
          ]
        }
      ]
    },
    {
      title: "Bodovanie",
      blocks: [
        "Po 7 zdvihoch sa kolo boduje porovnaním záväzku každého hráča s počtom zdvihov, ktoré skutočne vyhral.",
        {
          list: [
            "Presný záväzok: 15 bodov za každý vyhlásený zdvih.",
            "Presný záväzok 7: 105 bodov plus 50-bodový bonus.",
            "Viac zdvihov ako záväzok: 5 bodov za každý vyhraný zdvih.",
            "Menej zdvihov ako záväzok: -5 bodov za každý chýbajúci zdvih.",
            "Nesplnený záväzok 7: -50 bodov."
          ]
        },
        "Body za kolo sa pripočítajú k celkovému súčtu zápasu. Po nastavenom počte kôl vyhráva hráč s najvyšším celkovým skóre. V prípade potreby hra použije rozhodovacie kritériá založené na skóre, záväzku, vyhraných zdvihoch a poradí miest od rozdávajúceho."
      ]
    },
    {
      title: "Súkromie a férovosť",
      blocks: [
        "Server pre viac hráčov je autoritatívny. Vlastní zamiešaný balíček, stav hry, lehoty časovača, overovanie legálnych ťahov, bodovanie a postup kôl.",
        "Každý hráč dostane len svoju vlastnú ruku. Skryté kamene ostatných hráčov nie sú zahrnuté v ich snímkach. Verejné informácie zahŕňajú hlášky, vyhrané zdvihy, celkové skóre, aktuálny zdvih, dokončené zdvihy, stavy hráčov a počet zostávajúcich kameňov každého hráča.",
        "Rozdanie pre viac hráčov sa generuje zo serverového semienka. Vďaka tomu sú zápasy reprodukovateľné zo semienka a histórie udalostí, čo pomáha pri kontrolách férovosti, prehrávaní, ladení a obnove."
      ]
    },
    {
      title: "Štatistiky",
      blocks: [
        "Štatistiky sa počítajú len z hier pre viac hráčov, kde všetky štyri miesta obsadia štyria odlišní registrovaní (prihlásení) hráči."
      ]
    }
  ]
};
