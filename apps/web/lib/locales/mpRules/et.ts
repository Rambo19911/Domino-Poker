import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesEt: MpRulesDoc = {
  intro: [
    "See mäng on väga dünaamiline ja nõuab reeglite head mõistmist, et lühikese ajaga otsuseid teha. Treenimiseks on soovitatav mängida üksikmängu režiimis.",
    "Domino Pokeri mitmikmäng on reaalajas neljakohaline lauamäng. Iga partii kasutab standardset kahekuuelist dominokomplekti 28 kiviga, mis jagatakse 7 kivi igale kohale. Mängida võivad neli inimmängijat või inimeste ja botide segu. Partii saab alata vaid siis, kui kõik neli kohta on täidetud ja vähemalt ühel kohal istub inimmängija."
  ],
  sections: [
    {
      title: "Avalikud ja privaattoad",
      blocks: [
        "Mängijad saavad luua kas avaliku või privaattoa.",
        "Avalikud toad on mõeldud ooteruumist leitavateks. Teised mängijad saavad neid tubade loendist leida, avada toa vaate, valida tühja koha ja liituda, kuni tuba veel alustamist ootab.",
        "Privaattoad on mõeldud kutsutud mängijatele. Neil on tavaline toa olek ja kohad, kuid privaattoaga liitumiseks on vaja toa koodi. Privaattoaga ei saa liituda lihtsalt selle toa ID-d avaliku ooteruumi kaudu kasutades. Toa kood kuvatakse toa vaates ning seda tuleks jagada ainult nende mängijatega, keda soovid kutsuda.",
        "Nii avalikud kui ka privaattoad toetavad samu mängureegleid, sama kohasüsteemi, sama botidega täitmise valikut ja sama partii kulgu. Erinevus on leitavuses ja liitumisõiguses: avalike tubadega saab liituda ooteruumist; privaattoad nõuavad koodi."
      ]
    },
    {
      title: "Toa kohad ja võõrustaja juhtnupud",
      blocks: [
        "Igas toas on täpselt neli kohta. Mängijast, kes toa loob, saab võõrustaja ja ta paigutatakse esimesele kohale. Teised mängijad saavad liituda vabade kohtadega, kuni tuba ootab.",
        "Võõrustaja saab tühjad kohad botidega täita. See võimaldab mängu alustada isegi siis, kui saadaval on vähem kui neli inimmängijat. Võõrustaja on ka ainus mängija, kes saab mängu alustada.",
        "Mängu ei saa alustada, kui mõni koht on veel tühi. Kui võõrustaja proovib liiga vara alustada, lükkab server alustamise tagasi. Praktiline reegel on lihtne: nõutav on neli hõivatud kohta, inimesed või botid.",
        "Kui võõrustaja lahkub, kui tuba veel ootab, läheb võõrustaja roll üle teisele alles jäänud inimmängijale. Kui ootavasse tuppa ei jää ühtegi inimmängijat, tuba hävitatakse."
      ]
    },
    {
      title: "Kuldmündid ja tasulised toad",
      blocks: [
        "Toad võivad olla tasuta või tasulised. Toa loomisel võib sisselogitud võõrustaja määrata kuldse sisenemistasu — mis tahes summa kuni oma saldoni (0 tähendab tasuta tuba, mis käitub täpselt nagu varem).",
        "Tasulises toas saavad koha võtta ainult registreeritud, sisselogitud mängijad: neil on kullasaldo. Anonüümsetel mängijatel rahakotti pole, seega ei saa nad tasuliste tubadega liituda, kuid nad saavad endiselt tasuta tubadega liituda.",
        "Iga mängija maksab sisenemistasu koha võtmise hetkel, kaasa arvatud võõrustaja. Koha saab võtta ainult siis, kui saldo katab tasu. Kogutud tasud moodustavad toa auhinnapanga.",
        "Enne mängu algust on raha täielikult tagastatav. Kui lahkud oma kohalt, kui tuba veel ootab, võõrustaja kustutab ootava toa või tuba aegub enne algust, tagastatakse su sisenemistasu su saldole.",
        "Kui mäng on alanud, ei ole sisenemistasu enam tagastatav. Lahkumine, loobumine või ühenduse katkemine partii ajal ei tagasta su tasu — see jääb panka võitjatele.",
        "Kui partii lõpeb, jagatakse pank kahe parima registreeritud inimmängija vahel kogusumma järgi: 70% esimesele kohale ja 30% teisele. Botid ei saa kunagi osa, ja loobunud mängijad jäetakse välja. Kui alles jääb vaid üks registreeritud inimene, võtab see mängija kogu panga.",
        "Kui kõik inimesed lahkuvad ja partii jäetakse pooleli ilma lõpetamata, ei ole võitjat, seega panka välja ei maksta.",
        "Saldo, mida näed, uueneb reaalajas, kui maksad, saad tagasimakse või võidad panga. Server on alati autoriteet iga mündiliikumise üle."
      ]
    },
    {
      title: "Üks tuba korraga",
      blocks: [
        "Mängija saab korraga olla ainult ühes toas. Kui mängija on juba toa loonud või sellega liitunud, lükkab server tagasi katsed luua teine tuba või liituda mõne teisega, kuni see mängija lahkub praegusest toast, loobub aktiivsest mängust või mäng lõpeb ja tuba koristatakse.",
        "See takistab ühel brauseriidentiteedil hõivata kohti mitmes toas korraga.",
        "Mitme inimmängijaga kohalikuks testimiseks ühes arvutis vajab iga mängija eraldi brauseriidentiteeti, näiteks erinevaid brausereid või inkognito-/privaataknaid."
      ]
    },
    {
      title: "Toa eluiga ja TTL",
      blocks: [
        "Tubadel on eluiga 1 tund alates loomisest.",
        "Ootavad, alustavad, lõpetatud või hävitatud toad koristatakse pärast nende TTL-i aegumist. Koristus käib perioodiliselt, seega võib eemaldamine toimuda veidi pärast täpset aegumisaega, mitte täpsel millisekundil.",
        "Aktiivseid mängusoleku tube ei hävitata pelgalt seetõttu, et algne TTL on möödunud. Kui partii on juba käimas, lubatakse toal lõpuni jõuda. Pärast mängu lõppu edastab server lõpliku mängutulemuse ja seejärel hävitab toa, et mängijad saaksid vabalt luua või liituda mõne teise toaga.",
        "Kui kõik inimmängijad katkestavad aktiivsest mängust ühenduse, annab server lühikese taasühendumise armuaja. Kui selle armuaja jooksul ükski inimene tagasi ei tule, hävitatakse mahajäetud tuba."
      ]
    },
    {
      title: "Mängu alustamine",
      blocks: [
        "Kui võõrustaja alustab täis tuba, loob server autoriteetse mänguoleku ja saadab igale istuvale inimmängijale tema isikliku mängu hetkeülesvõtte. Iga mängija saab ainult oma käe. Vastaste peidetud kive ei saadeta kunagi teistele mängijatele.",
        "Pärast seda, kui tuba siseneb mängu, toimub enne esimest pakkumiskäiku 10-sekundiline mängueelne pöördloendus. See annab mängijatele aega laud laadida, enne kui tegelik käigutaimer käivitub.",
        "See mängueelne pöördloendus on eraldi käigupõhisest 10-sekundilisest taimerist."
      ]
    },
    {
      title: "10-sekundiline käigutaimer",
      blocks: [
        "Igal inimese pakkumisel või käigul on oma 10-sekundiline serveri juhitav taimer.",
        "Taimer käivitub ainult siis, kui on tegelikult selle inimmängija kord. Kui botid peavad enne järgmist inimest tegutsema, mängib server kõigepealt botid lühikese rütmiviivisega ja alles seejärel käivitab inimmängija 10-sekundilise pöördloenduse. See tähendab, et inimmängija ei kaota aega, oodates botide animatsioone või botide käikude lahenemist.",
        "Server on aja autoriteet. Klient kuvab pöördloenduse, kuid server otsustab, kas toiming saabus enne tähtaega.",
        "Kui mängija esitab pakkumise või käigu enne tähtaega, valideeritakse toiming ja võetakse vastu ainult siis, kui see on lubatud.",
        "Kui toiming saabub pärast tähtaega, lükkab server selle hilinenuna tagasi.",
        "Kui taimer aegub ja mängija pole tegutsenud, lahendab server käigu automaatselt, et mäng kunagi ei seiskuks:",
        {
          list: [
            "Pakkumise ajal seatakse aegumispakkumine sundkorras ohutule lubatud pakkumisele, tavaliselt 0.",
            "Kivide mängimise ajal valib ja mängib server selle mängija eest lubatud käigu.",
            "Kui tihi saab aegumiskäiguga täis, lahendab server tihi võitja ja viib mängu edasi."
          ]
        },
        "Korduvalt vahelejäänud käigud mõjutavad mängija mitteaktiivsuse staatust. Pärast esimest vahelejäänud käiku märgitakse mängija hoiatusolekuga. Pärast teist loetakse ta mitteaktiivseks. Pärast kolmandat lülitatakse sellele mängijale automaatmäng sisse. Naasev mängija saab jätkata ja automaatmängu välja lülitada, et taastada käsitsijuhtimine."
      ]
    },
    {
      title: "Ühenduse katkemised ja taasühendumised",
      blocks: [
        "Kui mängija katkestab mängu ajal ühenduse, ei eemaldata tema kohta kohe. Mäng jätkub ja tema tulevasi käike saab käsitleda aegumissüsteem, kui ta õigeks ajaks tagasi ei tule.",
        "Kui mängija taasühendub sama brauseriidentiteedi ja taasühendumismärgiga, taastab server tema toa, koha, ühenduse oleku ja saadab värske isikliku hetkeülesvõtte. See hetkeülesvõte sisaldab praegust mänguolekut ja, kui käik on aktiivne, praegust käigu tähtaega.",
        "Kui mängija lahkub tahtlikult aktiivse mängu ajal, käsitletakse seda loobumisena. Tema kohast saab boti koht, mängija saadetakse tagasi ooteruumi ja ta ei saa sama kohta uuesti liituda. Ülejäänud mängijad jätkavad partiid."
      ]
    },
    {
      title: "Pakkumine ja mängu kulg",
      blocks: [
        "Iga ring algab pakkumisega. Iga mängija pakub ühe korra, valides, mitut 7 tihist ta loodab võita. Kehtivad pakkumised on 0 kuni 7.",
        "Pärast kõigi pakkumiste tegemist algab mängufaas. Mängijad mängivad ühe domino tihi kohta. Iga tihi võitja alustab järgmist tihti.",
        "Server valideerib iga käigu. Klient võib mugavuse huvides võimalikke käike esile tõsta, kuid klient ei otsusta, mis on lubatud. Server lükkab tagasi lubamatud käigud, vale mängija käigud, aegunud käigu ID-d ja hilinenud toimingud."
      ]
    },
    {
      title: "Kivide reeglid",
      blocks: [
        "Trumbid on tugevaim kivide rühm. Tugevaimast nõrgimani on trumpide järjekord:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Ässad on:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Kivil 0-6 on eriline kahetine roll. Kui see mängitakse või nõutakse 0-na, käitub see ässana. Kui see deklareeritakse 6-na, käitub see tavalise 6-kivina.",
        "Tihti alustades võib mängija alustada mis tahes kiviga. Kui alustav kivi ei ole trump ega kaksik ja sellel on kaks erinevat numbrit, peab mängija deklareerima, millist numbrit nõutakse.",
        "Tihti järgides:",
        {
          list: [
            "Kui alustati trumbiga, peavad mängijad mängima trumbi, kui neil selline on. Kui neil on tugevam trump kui tihis juba olev tugevaim trump, peavad nad mängima tugevama trumbi.",
            "Kui nõuti numbrit, peavad mängijad seda numbrit võimalusel järgima mitte-trump-kiviga.",
            "Kui nad ei saa nõutud numbrit järgida, peavad nad mängima trumbi, kui neil selline on.",
            "Kui nad ei saa järgida ja trumpi pole, võivad nad loobuda mis tahes kivist."
          ]
        }
      ]
    },
    {
      title: "Punktiarvestus",
      blocks: [
        "Pärast 7 tihti hinnatakse ring, võrreldes iga mängija pakkumist tegelikult võidetud tihide arvuga.",
        {
          list: [
            "Täpne pakkumine: 15 punkti pakutud tihi kohta.",
            "Täpne pakkumine 7: 105 punkti pluss 50-punktiline boonus.",
            "Rohkem tihisid kui pakuti: 5 punkti võidetud tihi kohta.",
            "Vähem tihisid kui pakuti: -5 punkti iga puuduva tihi eest.",
            "Täitmata pakkumine 7: -50 punkti."
          ]
        },
        "Ringi punktid liidetakse partii kogusummale. Pärast määratud ringide arvu võidab suurima kogusummaga mängija. Vajadusel kasutab mäng viiginäitajaid punktide, pakkumise, võidetud tihide ja jagajast arvestatava kohajärjestuse alusel."
      ]
    },
    {
      title: "Privaatsus ja õiglus",
      blocks: [
        "Mitmikmängu server on autoriteetne. Talle kuuluvad segatud kividepakk, mänguolek, taimeri tähtajad, lubatud käikude valideerimine, punktiarvestus ja ringide edenemine.",
        "Iga mängija saab ainult oma käe. Teiste mängijate peidetud kive nende hetkeülesvõtetesse ei kaasata. Avalik teave hõlmab pakkumisi, võidetud tihisid, kogusummasid, praegust tihti, lõpetatud tihisid, mängijate staatusi ja iga mängija allesjäänud kivide arvu.",
        "Mitmikmängu jagamine genereeritakse serveripoolsest seemnest. See teeb partiid seemnest ja sündmuste ajaloost taasloodavaks, mis aitab õiglusekontrollide, kordusvaatamise, silumise ja taastamise puhul."
      ]
    },
    {
      title: "Statistika",
      blocks: [
        "Statistikat arvestatakse ainult mitmikmängudest, kus kõik neli kohta on hõivatud nelja erineva registreeritud (sisselogitud) mängijaga."
      ]
    }
  ]
};
