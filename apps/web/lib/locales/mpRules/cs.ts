import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesCs: MpRulesDoc = {
  intro: [
    "Tato hra je velmi dynamická a vyžaduje dobré porozumění pravidlům, abyste se dokázali v krátkém čase rozhodovat. Pro trénink se doporučuje hrát režim pro jednoho hráče.",
    "Domino Poker pro více hráčů je hra u stolu se čtyřmi místy v reálném čase. Každý zápas používá standardní sadu domina dvojitá šestka s 28 kameny, rozdanými po 7 kamenech na každé místo. Hru mohou hrát čtyři lidští hráči, nebo směs lidí a botů. Zápas může začít pouze tehdy, když jsou obsazena všechna čtyři místa a alespoň jedno místo zaujímá lidský hráč."
  ],
  sections: [
    {
      title: "Veřejné a soukromé místnosti",
      blocks: [
        "Hráči mohou vytvořit veřejnou nebo soukromou místnost.",
        "Veřejné místnosti jsou určené k tomu, aby byly objevitelné z předsíně. Ostatní hráči je mohou najít v seznamu místností, otevřít zobrazení místnosti, vybrat volné místo a připojit se, dokud místnost stále čeká na začátek.",
        "Soukromé místnosti jsou určené pro pozvané hráče. Mají normální stav místnosti a místa, ale připojení do soukromé místnosti vyžaduje kód místnosti. Do soukromé místnosti se nelze připojit pouze pomocí jejího ID z postupu veřejné předsíně. Kód místnosti se zobrazuje v zobrazení místnosti a měl by být sdílen jen s hráči, které chcete pozvat.",
        "Veřejné i soukromé místnosti podporují stejná herní pravidla, stejný systém míst, stejnou možnost doplnění boty a stejný průběh zápasu. Rozdíl je v objevitelnosti a přístupu k připojení: do veřejných místností se lze připojit z předsíně; soukromé vyžadují kód."
      ]
    },
    {
      title: "Místa v místnosti a ovládání hostitele",
      blocks: [
        "Každá místnost má přesně čtyři místa. Hráč, který místnost vytvoří, se stane hostitelem a je umístěn na první místo. Ostatní hráči mohou obsazovat volná místa, dokud místnost čeká.",
        "Hostitel může doplnit volná místa boty. To umožňuje začít hru i tehdy, je-li k dispozici méně než čtyři lidští hráči. Hostitel je také jediný hráč, který může hru spustit.",
        "Hru nelze spustit, je-li některé místo stále volné. Pokud se hostitel pokusí spustit příliš brzy, server spuštění odmítne. Praktické pravidlo je jednoduché: vyžadují se čtyři obsazená místa, lidmi nebo boty.",
        "Pokud hostitel odejde, zatímco místnost stále čeká, vlastnictví hostitele přejde na jiného zbývajícího lidského hráče. Pokud v čekající místnosti nezůstane žádný lidský hráč, místnost se zruší."
      ]
    },
    {
      title: "Zlaté mince a placené místnosti",
      blocks: [
        "Místnosti mohou být zdarma nebo placené. Při vytváření místnosti může přihlášený hostitel nastavit vstupní poplatek ve zlatě — libovolnou částku až do výše vlastního zůstatku (0 znamená místnost zdarma, která se chová přesně jako dříve).",
        "Místo v placené místnosti mohou obsadit pouze registrovaní, přihlášení hráči: mají zůstatek zlata. Anonymní hráči nemají peněženku, takže se nemohou připojit do placených místností, ale stále se mohou připojit do místností zdarma.",
        "Každý hráč zaplatí vstupní poplatek v okamžiku, kdy obsadí místo, včetně hostitele. Místo lze obsadit pouze tehdy, pokud zůstatek pokryje poplatek. Vybrané poplatky tvoří výherní bank místnosti.",
        "Před začátkem hry jsou peníze plně vratné. Pokud opustíte své místo, zatímco místnost stále čeká, hostitel smaže čekající místnost nebo místnosti vyprší platnost před začátkem, váš vstupní poplatek se vrátí na váš zůstatek.",
        "Jakmile hra začne, vstupní poplatek již není vratný. Odchod, vzdání se nebo odpojení během zápasu váš poplatek nevrátí — zůstává v banku pro vítěze.",
        "Když zápas skončí, bank se rozdělí mezi dva nejlepší registrované lidské hráče podle celkového skóre: 70% pro první místo a 30% pro druhé. Boti nikdy nedostávají podíl a hráči, kteří se vzdali, jsou vyloučeni. Pokud zůstane jen jeden registrovaný člověk, ten získá celý bank.",
        "Pokud všichni lidé odejdou a zápas je opuštěn bez dokončení, není žádný vítěz, takže se bank nevyplácí.",
        "Zůstatek, který vidíte, se aktualizuje živě, jak platíte, dostáváte zpět nebo vyhráváte bank. Server je vždy autoritou nad každým pohybem mince."
      ]
    },
    {
      title: "Jedna místnost v jednu chvíli",
      blocks: [
        "Hráč může být v jednu chvíli pouze v jedné místnosti. Pokud hráč již vytvořil místnost nebo se k ní připojil, server odmítne pokusy o vytvoření další místnosti nebo připojení k jiné, dokud tento hráč neopustí aktuální místnost, nevzdá se aktivní hry, nebo hra neskončí a místnost není uklizena.",
        "Tím se zabrání tomu, aby jedna identita prohlížeče obsazovala místa ve více místnostech najednou.",
        "Pro lokální testování s více lidskými hráči na jednom počítači potřebuje každý hráč samostatnou identitu prohlížeče, například různé prohlížeče nebo inkognito/soukromá okna."
      ]
    },
    {
      title: "Životnost místnosti a TTL",
      blocks: [
        "Místnosti mají dobu životnosti 1 hodina od vytvoření.",
        "Čekající, spouštějící se, dokončené nebo zrušené místnosti se uklidí po vypršení jejich TTL. Úklid probíhá pravidelně, takže k odstranění může dojít krátce po přesném čase vypršení, nikoli v přesné milisekundě.",
        "Aktivní rozehrané místnosti se neruší jen proto, že uplynulo původní TTL. Pokud již zápas probíhá, místnosti je umožněno dokončit. Po skončení hry server doručí konečný výsledek hry a poté místnost zruší, takže hráči mohou vytvořit nebo se připojit k jiné místnosti.",
        "Pokud se z aktivní hry odpojí všichni lidští hráči, server poskytne krátkou dobu odkladu pro opětovné připojení. Pokud se během této doby odkladu žádný člověk nevrátí, opuštěná místnost se zruší."
      ]
    },
    {
      title: "Spuštění hry",
      blocks: [
        "Když hostitel spustí plnou místnost, server vytvoří autoritativní stav hry a každému usazenému lidskému hráči pošle jeho vlastní osobní snímek hry. Každý hráč obdrží pouze svou vlastní ruku. Skryté kameny soupeřů se ostatním hráčům nikdy neposílají.",
        "Poté, co místnost vstoupí do hry, proběhne před prvním sázecím tahem 10sekundový odpočet před hrou. To dává hráčům čas na načtení stolu, než se spustí skutečný časovač tahu.",
        "Tento odpočet před hrou je oddělený od 10sekundového časovače na každý tah."
      ]
    },
    {
      title: "10sekundový časovač tahu",
      blocks: [
        "Každá lidská sázka nebo tah má svůj vlastní 10sekundový časovač řízený serverem.",
        "Časovač se spustí pouze tehdy, když je skutečně na tahu daný lidský hráč. Pokud musí před dalším člověkem jednat boti, server nejprve zahraje boty s krátkým prodlevovým tempem a teprve poté spustí 10sekundový odpočet lidského hráče. To znamená, že lidský hráč neztrácí čas čekáním na animace botů nebo dohrání tahů botů.",
        "Server je autoritou nad časem. Klient zobrazuje odpočet, ale server rozhoduje, zda akce dorazila před uplynutím lhůty.",
        "Pokud hráč odešle sázku nebo tah před uplynutím lhůty, akce je ověřena a přijata pouze tehdy, je-li legální.",
        "Pokud akce dorazí po uplynutí lhůty, server ji odmítne jako pozdní.",
        "Pokud časovač vyprší a hráč nejednal, server tah automaticky vyřeší, aby se hra nikdy nezasekla:",
        {
          list: [
            "Během sázení je sázka při vypršení času vynuceně nastavena na bezpečnou legální sázku, obvykle 0.",
            "Během hraní kamenů server za daného hráče vybere a zahraje legální tah.",
            "Pokud je tahem při vypršení času zdvih dokončen, server vyřeší vítěze zdvihu a posune hru vpřed."
          ]
        },
        "Opakovaně zmeškané tahy ovlivňují stav nečinnosti hráče. Po prvním zmeškaném tahu je hráč označen výstražným stavem. Po druhém je považován za nečinného. Po třetím se pro tohoto hráče zapne automatická hra. Vracející se hráč může pokračovat a vypnout automatickou hru, aby získal zpět manuální kontrolu."
      ]
    },
    {
      title: "Odpojení a opětovná připojení",
      blocks: [
        "Pokud se hráč během hry odpojí, jeho místo není okamžitě odebráno. Hra pokračuje a jeho budoucí tahy může obsloužit systém vypršení času, pokud se včas nevrátí.",
        "Když se hráč znovu připojí se stejnou identitou prohlížeče a tokenem opětovného připojení, server obnoví jeho místnost, místo, stav připojení a pošle čerstvý osobní snímek. Tento snímek obsahuje aktuální stav hry a, je-li tah aktivní, aktuální lhůtu tahu.",
        "Pokud hráč úmyslně odejde během aktivní hry, považuje se to za vzdání se. Jeho místo se stane místem bota, hráč je vrácen do předsíně a nemůže se znovu připojit na stejné místo. Zbývající hráči pokračují v zápase."
      ]
    },
    {
      title: "Sázení a průběh hry",
      blocks: [
        "Každé kolo začíná sázením. Každý hráč jednou vsadí a zvolí, kolik ze 7 zdvihů očekává, že vyhraje. Platné sázky jsou od 0 do 7.",
        "Po umístění všech sázek začíná fáze hry. Hráči hrají jeden kámen na zdvih. Vítěz každého zdvihu vynáší do dalšího zdvihu.",
        "Server ověřuje každý tah. Klient může pro pohodlí zvýraznit možné tahy, ale klient nerozhoduje o tom, co je legální. Server odmítá nelegální tahy, tahy nesprávného hráče, zastaralá ID tahů a pozdní akce."
      ]
    },
    {
      title: "Pravidla kamenů",
      blocks: [
        "Trumfy jsou nejsilnější skupina kamenů. Od nejvyššího po nejnižší je pořadí trumfů:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Esa jsou:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Kámen 0-6 má zvláštní dvojí roli. Je-li zahrán nebo vyžadován jako 0, chová se jako eso. Je-li ohlášen jako 6, chová se jako běžný kámen 6.",
        "Při vynášení zdvihu může hráč vynést libovolným kamenem. Pokud vynesený kámen není trumf ani dvojka a má dvě různá čísla, hráč musí ohlásit, které číslo je požadováno.",
        "Při přiznávání zdvihu:",
        {
          list: [
            "Pokud byl vynesen trumf, hráči musí zahrát trumf, mají-li nějaký. Pokud mají silnější trumf, než je nejsilnější trumf již ve zdvihu, musí zahrát silnější trumf.",
            "Pokud bylo požadováno číslo, hráči musí toto číslo přiznat netrumfovým kamenem, je-li to možné.",
            "Pokud nemohou požadované číslo přiznat, musí zahrát trumf, mají-li nějaký.",
            "Pokud nemohou přiznat a nemají trumf, smí odhodit libovolný kámen."
          ]
        }
      ]
    },
    {
      title: "Počítání bodů",
      blocks: [
        "Po 7 zdvizích se kolo vyhodnotí porovnáním sázky každého hráče s počtem zdvihů, které skutečně vyhrál.",
        {
          list: [
            "Přesná sázka: 15 bodů za každý vsazený zdvih.",
            "Přesná sázka 7: 105 bodů plus 50bodový bonus.",
            "Více zdvihů než vsazeno: 5 bodů za každý vyhraný zdvih.",
            "Méně zdvihů než vsazeno: -5 bodů za každý chybějící zdvih.",
            "Nesplněná sázka 7: -50 bodů."
          ]
        },
        "Body z kola se přičtou k celkovému součtu zápasu. Po nastaveném počtu kol vítězí hráč s nejvyšším celkovým skóre. V případě potřeby hra použije rozhodovací kritéria podle skóre, sázky, získaných zdvihů a pořadí míst od rozdávajícího."
      ]
    },
    {
      title: "Soukromí a férovost",
      blocks: [
        "Server pro více hráčů je autoritativní. Vlastní zamíchaný balíček, stav hry, lhůty časovače, ověřování legálních tahů, počítání bodů a postup kol.",
        "Každý hráč obdrží pouze svou vlastní ruku. Skryté kameny ostatních hráčů nejsou součástí jejich snímků. Veřejné informace zahrnují sázky, získané zdvihy, celková skóre, aktuální zdvih, dokončené zdvihy, stavy hráčů a počet zbývajících kamenů každého hráče.",
        "Rozdání pro více hráčů se generuje ze serverového semínka. Díky tomu jsou zápasy reprodukovatelné ze semínka a historie událostí, což pomáhá při kontrolách férovosti, opakování, ladění a obnově."
      ]
    },
    {
      title: "Statistiky",
      blocks: [
        "Statistiky se počítají pouze z her pro více hráčů, kde jsou všechna čtyři místa obsazena čtyřmi různými registrovanými (přihlášenými) hráči."
      ]
    }
  ]
};
