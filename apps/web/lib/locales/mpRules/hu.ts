import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesHu: MpRulesDoc = {
  intro: [
    "Ez a játék nagyon dinamikus, és jó szabályismeretet igényel ahhoz, hogy rövid idő alatt döntéseket lehessen hozni. Gyakorláshoz az egyjátékos mód ajánlott.",
    "A Domino Poker többjátékos módja egy valós idejű, négyfős asztali játék. Minden játszma egy szabványos, dupla-hatos dominókészletet használ 28 kővel, helyenként 7-7 követ kiosztva. A játékot játszhatja négy emberi játékos, vagy emberek és gépek vegyesen. Egy játszma csak akkor indulhat, ha mind a négy hely betelt, és legalább egy helyet emberi játékos foglal el."
  ],
  sections: [
    {
      title: "Nyilvános és privát szobák",
      blocks: [
        "A játékosok létrehozhatnak nyilvános vagy privát szobát is.",
        "A nyilvános szobák arra szolgálnak, hogy az előcsarnokból megtalálhatók legyenek. Más játékosok megtalálhatják őket a szobalistában, megnyithatják a szoba nézetét, választhatnak egy üres helyet, és csatlakozhatnak, amíg a szoba még a kezdésre vár.",
        "A privát szobák meghívott játékosoknak szólnak. Ugyanúgy van normál szobaállapotuk és helyük, de egy privát szobához való csatlakozáshoz szükség van a szobakódra. Egy privát szobához nem lehet csatlakozni pusztán a szoba azonosítójának a nyilvános előcsarnok-folyamatból való használatával. A szobakód a szoba nézetében látható, és csak azokkal a játékosokkal szabad megosztani, akiket meg szeretnél hívni.",
        "A nyilvános és a privát szobák egyaránt ugyanazokat a játékszabályokat, ugyanazt a helyrendszert, ugyanazt a gépekkel feltöltési lehetőséget és ugyanazt a játszmamenetet támogatják. A különbség a megtalálhatóságban és a csatlakozási hozzáférésben van: a nyilvános szobákhoz az előcsarnokból lehet csatlakozni; a privátakhoz kód kell."
      ]
    },
    {
      title: "Szobahelyek és házigazdai vezérlés",
      blocks: [
        "Minden szobának pontosan négy helye van. Az a játékos, aki létrehozza a szobát, lesz a házigazda, és az első helyre kerül. Más játékosok elfoglalhatják a szabad helyeket, amíg a szoba várakozik.",
        "A házigazda feltöltheti az üres helyeket gépekkel. Ez lehetővé teszi a játszma indítását akkor is, ha négynél kevesebb emberi játékos érhető el. A házigazda egyúttal az egyetlen játékos, aki elindíthatja a játszmát.",
        "A játszma nem indulhat el, ha bármelyik hely még üres. Ha a házigazda túl korán próbál indítani, a szerver elutasítja az indítást. A gyakorlati szabály egyszerű: négy elfoglalt hely szükséges, emberek vagy gépek.",
        "Ha a házigazda elhagyja a szobát, miközben az még várakozik, a házigazdai jogosultság átszáll egy másik megmaradt emberi játékosra. Ha egy várakozó szobában nem marad emberi játékos, a szoba megszűnik."
      ]
    },
    {
      title: "Aranyérmék és fizetős szobák",
      blocks: [
        "A szobák lehetnek ingyenesek vagy fizetősek. Szoba létrehozásakor egy bejelentkezett házigazda beállíthat arany nevezési díjat — bármekkora összeget a saját egyenlegéig (a 0 ingyenes szobát jelent, amely pontosan úgy működik, mint korábban).",
        "Fizetős szobában csak regisztrált, bejelentkezett játékosok foglalhatnak helyet: nekik van aranyegyenlegük. A névtelen játékosoknak nincs pénztárcájuk, ezért nem csatlakozhatnak fizetős szobákhoz, de az ingyenes szobákhoz továbbra is csatlakozhatnak.",
        "Minden játékos a helyfoglalás pillanatában fizeti meg a nevezési díjat, beleértve a házigazdát is. Hely csak akkor foglalható el, ha az egyenleg fedezi a díjat. A beszedett díjak alkotják a szoba nyereménykasszáját.",
        "A játszma kezdete előtt a pénz teljesen visszatéríthető. Ha elhagyod a helyedet, miközben a szoba még várakozik, a házigazda törli a várakozó szobát, vagy a szoba a kezdés előtt lejár, a nevezési díjad visszakerül az egyenlegedre.",
        "Miután a játszma elindult, a nevezési díj már nem téríthető vissza. A kilépés, a feladás vagy a játszma közbeni lecsatlakozás nem adja vissza a díjadat — az a kasszában marad a győztesek számára.",
        "Amikor a játszma véget ér, a kassza a két legmagasabb összpontszámú regisztrált emberi játékos között oszlik meg: 70% az első helynek és 30% a másodiknak. A gépek soha nem kapnak részt, és a feladott játékosok ki vannak zárva. Ha csak egyetlen regisztrált ember marad, az a játékos viszi az egész kasszát.",
        "Ha minden ember elhagyja a játszmát, és az befejezés nélkül marad abba, nincs győztes, így a kassza nem kerül kifizetésre.",
        "A látott egyenleg élőben frissül, ahogy fizetsz, visszatérítést kapsz vagy megnyered a kasszát. Minden érmemozgásban mindig a szerver a hiteles forrás."
      ]
    },
    {
      title: "Egyszerre egy szoba",
      blocks: [
        "Egy játékos egyszerre csak egy szobában lehet. Ha egy játékos már létrehozott vagy csatlakozott egy szobához, a szerver elutasítja a próbálkozásokat egy másik szoba létrehozására vagy egy másikhoz való csatlakozásra mindaddig, amíg az a játékos el nem hagyja a jelenlegi szobát, fel nem adja az aktív játszmát, vagy a játszma véget nem ér és a szoba meg nem szűnik.",
        "Ez megakadályozza, hogy egyetlen böngészőidentitás egyszerre több szobában is helyeket foglaljon.",
        "Az egy gépen több emberi játékossal végzett helyi teszteléshez minden játékosnak külön böngészőidentitásra van szüksége, például különböző böngészőkre vagy inkognitó/privát ablakokra."
      ]
    },
    {
      title: "Szoba élettartama és TTL",
      blocks: [
        "A szobáknak a létrehozástól számítva 1 óra az élettartamuk.",
        "A várakozó, induló, befejezett vagy megszűnt szobák a TTL-ük lejárta után takarításra kerülnek. A takarítás időszakosan fut, így az eltávolítás röviddel a pontos lejárati idő után történhet, nem pedig pontosan ezredmásodpercre.",
        "Az aktív, játékban lévő szobák nem szűnnek meg pusztán azért, mert az eredeti TTL letelt. Ha egy játszma már folyamatban van, a szoba befejezheti azt. A játszma végén a szerver kézbesíti a végső játékeredményt, majd megszünteti a szobát, hogy a játékosok szabadon létrehozhassanak vagy csatlakozhassanak egy másik szobához.",
        "Ha egy aktív játszmáról minden emberi játékos lecsatlakozik, a szerver rövid türelmi időt ad az újrakapcsolódásra. Ha ezalatt a türelmi idő alatt egyetlen ember sem tér vissza, az elhagyott szoba megszűnik."
      ]
    },
    {
      title: "A játszma indítása",
      blocks: [
        "Amikor a házigazda elindít egy megtelt szobát, a szerver létrehozza a hiteles játékállapotot, és minden leültetett emberi játékosnak elküldi a saját, személyes játékpillanatképét. Minden játékos csak a saját lapját kapja meg. Az ellenfelek rejtett kövei soha nem kerülnek elküldésre más játékosoknak.",
        "Miután a szoba belép a játszmába, az első bemondási kör kezdete előtt 10 másodperces, játék előtti visszaszámlálás van. Ez időt ad a játékosoknak az asztal betöltésére, mielőtt elindul a valódi köri időzítő.",
        "Ez a játék előtti visszaszámlálás független a körönkénti 10 másodperces időzítőtől."
      ]
    },
    {
      title: "A 10 másodperces köri időzítő",
      blocks: [
        "Minden emberi bemondásnak vagy lépésnek saját, 10 másodperces, szerver által vezérelt időzítője van.",
        "Az időzítő csak akkor indul el, amikor valóban az adott emberi játékos köre van. Ha a következő ember előtt gépeknek kell cselekedniük, a szerver először a gépeket játssza le, rövid ütemezési késleltetéssel, és csak ezután indítja el az emberi játékos 10 másodperces visszaszámlálását. Ez azt jelenti, hogy az emberi játékos nem veszít időt, miközben a gépanimációkra vagy a gépek köreinek lezárására vár.",
        "A szerver az időbeli hiteles forrás. A kliens megjeleníti a visszaszámlálást, de a szerver dönti el, hogy egy cselekvés a határidő előtt érkezett-e meg.",
        "Ha egy játékos a határidő előtt küld be egy bemondást vagy lépést, a cselekvés ellenőrzésre kerül, és csak akkor fogadják el, ha szabályos.",
        "Ha a cselekvés a határidő után érkezik, a szerver túl későiként elutasítja.",
        "Ha az időzítő lejár, és a játékos nem cselekedett, a szerver automatikusan feloldja a kört, hogy a játszma soha ne akadjon el:",
        {
          list: [
            "Bemondás közben az időtúllépés miatti bemondás biztonságos, szabályos bemondásra kényszerül, általában 0-ra.",
            "Kőlejátszás közben a szerver kiválaszt és lejátszik egy szabályos lépést az adott játékos helyett.",
            "Ha egy ütés az időtúllépéses lépéssel fejeződik be, a szerver eldönti az ütés győztesét, és továbblépteti a játszmát."
          ]
        },
        "Az ismételten kihagyott körök befolyásolják a játékos inaktivitási állapotát. Az első kihagyott kör után a játékost figyelmeztető állapottal jelölik meg. A második után inaktívnak számít. A harmadik után az automatikus játék bekapcsol az adott játékos számára. A visszatérő játékos folytathat, és kikapcsolhatja az automatikus játékot, hogy visszanyerje a kézi vezérlést."
      ]
    },
    {
      title: "Lecsatlakozások és újrakapcsolódások",
      blocks: [
        "Ha egy játékos lecsatlakozik egy játszma közben, a helye nem törlődik azonnal. A játszma folytatódik, és a jövőbeli köreit az időtúllépési rendszer kezelheti, ha nem tér vissza időben.",
        "Amikor a játékos ugyanazzal a böngészőidentitással és újrakapcsolódási tokennel csatlakozik újra, a szerver visszaállítja a szobáját, a helyét, a kapcsolati állapotát, és küld egy friss, személyes pillanatképet. Ez a pillanatkép tartalmazza a jelenlegi játékállapotot, és ha egy kör aktív, az aktuális köri határidőt is.",
        "Ha egy játékos szándékosan kilép egy aktív játszma közben, az feladásnak minősül. A helye gépes hellyé válik, a játékos visszakerül az előcsarnokba, és nem csatlakozhat újra ugyanahhoz a helyhez. A megmaradt játékosok folytatják a játszmát."
      ]
    },
    {
      title: "Bemondás és játékmenet",
      blocks: [
        "Minden kör bemondással kezdődik. Minden játékos egyszer mond be, kiválasztva, hogy a 7 ütésből hányat vár megnyerni. Az érvényes bemondások 0-tól 7-ig terjednek.",
        "Miután minden bemondás megtörtént, megkezdődik a lejátszási szakasz. A játékosok ütésenként egy dominót játszanak ki. Minden ütés nyertese viszi a következő ütést.",
        "A szerver minden lépést ellenőriz. A kliens kényelmi célból kiemelheti a lehetséges lépéseket, de a kliens nem dönti el, mi szabályos. A szerver elutasítja a szabálytalan lépéseket, a rossz játékos lépéseit, az elavult kör-azonosítókat és a késői cselekvéseket."
      ]
    },
    {
      title: "Kőszabályok",
      blocks: [
        "Az aduk a legerősebb kőcsoport. A legmagasabbtól a legalacsonyabbig az adusorrend a következő:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Az ászok a következők:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "A 0-6 kőnek különleges, kettős szerepe van. Ha 0-ként játsszák ki vagy kérik, ászként viselkedik. Ha 6-ként jelentik be, közönséges 6-os kőként viselkedik.",
        "Egy ütés kezdésekor a játékos bármilyen kővel indíthat. Ha a kihívott kő nem adu vagy dupla, és két különböző száma van, a játékosnak be kell jelentenie, melyik számot kéri.",
        "Egy ütés követésekor:",
        {
          list: [
            "Ha adut hívtak, a játékosoknak adut kell játszaniuk, ha van nekik. Ha erősebb adujuk van, mint az ütésben már lévő legerősebb adu, erősebb adut kell játszaniuk.",
            "Ha egy számot kértek, a játékosoknak azt a számot kell követniük egy nem adu kővel, ha lehetséges.",
            "Ha nem tudják követni a kért számot, adut kell játszaniuk, ha van nekik.",
            "Ha nem tudják követni, és nincs adujuk, bármilyen követ eldobhatnak."
          ]
        }
      ]
    },
    {
      title: "Pontozás",
      blocks: [
        "7 ütés után a kört úgy pontozzák, hogy összehasonlítják minden játékos bemondását a ténylegesen megnyert ütések számával.",
        {
          list: [
            "Pontos bemondás: 15 pont bemondott ütésenként.",
            "Pontos 7-es bemondás: 105 pont plusz egy 50 pontos bónusz.",
            "A bemondottnál több ütés: 5 pont megnyert ütésenként.",
            "A bemondottnál kevesebb ütés: -5 pont hiányzó ütésenként.",
            "Sikertelen 7-es bemondás: -50 pont."
          ]
        },
        "A köri pontszámok hozzáadódnak a játszma összegéhez. A beállított számú kör után a legmagasabb összpontszámú játékos nyer. Ha szükséges, a játék holtversenydöntő szabályokat alkalmaz a pontszám, a bemondás, a megnyert ütések és az osztótól számított ülésrend alapján."
      ]
    },
    {
      title: "Adatvédelem és igazságosság",
      blocks: [
        "A többjátékos szerver hiteles forrás. Hozzá tartozik a megkevert pakli, a játékállapot, az időzítő-határidők, a szabályos lépések ellenőrzése, a pontozás és a körök léptetése.",
        "Minden játékos csak a saját lapját kapja meg. Más játékosok rejtett kövei nem szerepelnek a pillanatképükben. A nyilvános információk közé tartoznak a bemondások, a megnyert ütések, az összpontszámok, a jelenlegi ütés, a befejezett ütések, a játékosok állapotai és minden játékos megmaradt köveinek száma.",
        "A többjátékos osztás egy szerveroldali magból generálódik. Ez a magból és az eseménytörténetből reprodukálhatóvá teszi a játszmákat, ami segít az igazságossági ellenőrzésekben, a visszajátszásban, a hibakeresésben és a helyreállításban."
      ]
    },
    {
      title: "Statisztika",
      blocks: [
        "A statisztika csak azokból a többjátékos játszmákból számít, ahol mind a négy helyet négy különböző, regisztrált (bejelentkezett) játékos foglalja el."
      ]
    }
  ]
};
