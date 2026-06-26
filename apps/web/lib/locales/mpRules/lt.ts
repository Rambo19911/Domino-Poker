import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesLt: MpRulesDoc = {
  intro: [
    "Šis žaidimas yra labai dinamiškas ir reikalauja gero žaidimo taisyklių supratimo, kad per trumpą laiką būtų galima priimti sprendimus. Treniruotėms rekomenduojama žaisti vieno žaidėjo režimu.",
    "Domino Poker daugelio žaidėjų režimas yra realaus laiko žaidimas prie keturių vietų stalo. Kiekvienam mačui naudojamas standartinis dvigubo šešeto domino komplektas su 28 kauliukais, išdalijant po 7 kauliukus kiekvienai vietai. Žaisti gali keturi žmonės arba žmonių ir botų derinys. Mačas gali prasidėti tik tada, kai visos keturios vietos užimtos ir bent vienoje vietoje sėdi žmogus."
  ],
  sections: [
    {
      title: "Vieši ir privatūs kambariai",
      blocks: [
        "Žaidėjai gali sukurti viešą arba privatų kambarį.",
        "Vieši kambariai skirti būti randami iš vestibiulio. Kiti žaidėjai gali juos rasti kambarių sąraše, atidaryti kambario rodinį, pasirinkti laisvą vietą ir prisijungti, kol kambarys dar laukia starto.",
        "Privatūs kambariai skirti pakviestiems žaidėjams. Jie vis tiek turi įprastą kambario būseną ir vietas, tačiau norint prisijungti prie privataus kambario reikia kambario kodo. Prie privataus kambario negalima prisijungti vien naudojant jo kambario ID iš viešo vestibiulio srauto. Kambario kodas rodomas kambario rodinyje ir turėtų būti dalijamasi tik su tais žaidėjais, kuriuos norite pakviesti.",
        "Tiek vieši, tiek privatūs kambariai palaiko tas pačias žaidimo taisykles, tą pačią vietų sistemą, tą pačią užpildymo botais parinktį ir tą pačią mačo eigą. Skiriasi tik randamumas ir prisijungimo prieiga: prie viešų kambarių galima prisijungti iš vestibiulio; privatiems reikia kodo."
      ]
    },
    {
      title: "Kambario vietos ir šeimininko valdikliai",
      blocks: [
        "Kiekvienas kambarys turi lygiai keturias vietas. Žaidėjas, sukuriantis kambarį, tampa šeimininku ir sodinamas į pirmąją vietą. Kiti žaidėjai gali užimti laisvas vietas, kol kambarys laukia.",
        "Šeimininkas gali užpildyti laisvas vietas botais. Tai leidžia pradėti žaidimą net jei prieinama mažiau nei keturi žmonės. Šeimininkas taip pat yra vienintelis žaidėjas, galintis pradėti žaidimą.",
        "Žaidimas negali prasidėti, jei kuri nors vieta vis dar tuščia. Jei šeimininkas bando pradėti per anksti, serveris startą atmeta. Praktinė taisyklė paprasta: reikia keturių užimtų vietų — žmonių ar botų.",
        "Jei šeimininkas išeina, kol kambarys dar laukia, šeimininko teisės pereina kitam likusiam žmogui. Jei laukiančiame kambaryje nelieka nė vieno žmogaus, kambarys sunaikinamas."
      ]
    },
    {
      title: "Aukso monetos ir mokami kambariai",
      blocks: [
        "Kambariai gali būti nemokami arba mokami. Kurdamas kambarį, prisijungęs šeimininkas gali nustatyti aukso dalyvio mokestį — bet kokią sumą iki savo balanso (0 reiškia nemokamą kambarį, kuris veikia lygiai taip pat kaip anksčiau).",
        "Vietą mokamame kambaryje gali užimti tik registruoti, prisijungę žaidėjai: jie turi aukso balansą. Anoniminiai žaidėjai neturi piniginės, todėl negali prisijungti prie mokamų kambarių, bet vis tiek gali prisijungti prie nemokamų kambarių.",
        "Kiekvienas žaidėjas sumoka dalyvio mokestį tuo metu, kai užima vietą, įskaitant šeimininką. Vietą galima užimti tik tada, jei balanso pakanka mokesčiui padengti. Surinkti mokesčiai sudaro kambario prizinį banką.",
        "Prieš prasidedant žaidimui pinigai visiškai grąžinami. Jei paliekate savo vietą, kol kambarys dar laukia, šeimininkas ištrina laukiantį kambarį arba kambario galiojimas baigiasi prieš startą, jūsų dalyvio mokestis grąžinamas į jūsų balansą.",
        "Kai žaidimas prasideda, dalyvio mokestis nebegrąžinamas. Išėjimas, pasidavimas ar atsijungimas mačo metu mokesčio negrąžina — jis lieka banke nugalėtojams.",
        "Kai mačas baigiasi, bankas dalijamas tarp dviejų geriausių registruotų žmonių pagal bendrą rezultatą: 70% pirmajai vietai ir 30% antrajai. Botai niekada negauna dalies, o pasidavę žaidėjai išskiriami. Jei lieka tik vienas registruotas žmogus, tas žaidėjas pasiima visą banką.",
        "Jei visi žmonės išeina ir mačas paliekamas nebaigtas, nugalėtojo nėra, todėl bankas neišmokamas.",
        "Matomas balansas atnaujinamas tiesiogiai, kai mokate, gaunate grąžinimą ar laimite banką. Serveris visada yra autoritetas kiekvienam monetų judėjimui."
      ]
    },
    {
      title: "Vienas kambarys vienu metu",
      blocks: [
        "Žaidėjas vienu metu gali būti tik viename kambaryje. Jei žaidėjas jau sukūrė ar prisijungė prie kambario, serveris atmes bandymus sukurti kitą kambarį ar prisijungti prie kito, kol tas žaidėjas nepaliks dabartinio kambario, neatsisakys aktyvaus žaidimo arba žaidimas nesibaigs ir kambarys nebus sutvarkytas.",
        "Tai neleidžia vienai naršyklės tapatybei vienu metu užimti vietų keliuose kambariuose.",
        "Vietiniam testavimui su keliais žmonėmis viename kompiuteryje kiekvienam žaidėjui reikia atskiros naršyklės tapatybės, pavyzdžiui, skirtingų naršyklių arba inkognito / privačių langų."
      ]
    },
    {
      title: "Kambario gyvavimo laikas ir TTL",
      blocks: [
        "Kambariai turi gyvavimo laiką — 1 valanda nuo sukūrimo.",
        "Laukiantys, pradedami, baigti ar sunaikinti kambariai sutvarkomi pasibaigus jų TTL. Valymas vykdomas periodiškai, todėl pašalinimas gali įvykti netrukus po tikslaus galiojimo pabaigos laiko, o ne tiksliai milisekundę.",
        "Aktyvūs žaidžiami kambariai nesunaikinami vien dėl to, kad praėjo pradinis TTL. Jei mačas jau vyksta, kambariui leidžiama pasibaigti. Žaidimui pasibaigus, serveris pristato galutinį žaidimo rezultatą ir tada sunaikina kambarį, kad žaidėjai galėtų laisvai kurti ar prisijungti prie kito kambario.",
        "Jei visi žmonės atsijungia nuo aktyvaus žaidimo, serveris suteikia trumpą pakartotinio prisijungimo malonės laikotarpį. Jei per tą laikotarpį nė vienas žmogus negrįžta, paliktas kambarys sunaikinamas."
      ]
    },
    {
      title: "Žaidimo pradėjimas",
      blocks: [
        "Kai šeimininkas pradeda pilną kambarį, serveris sukuria autoritetinę žaidimo būseną ir kiekvienam sėdinčiam žmogui siunčia jo asmeninį žaidimo momentinį vaizdą. Kiekvienas žaidėjas gauna tik savo ranką. Varžovų paslėpti kauliukai niekada nesiunčiami kitiems žaidėjams.",
        "Kambariui įėjus į žaidimą, prieš prasidedant pirmajai deklaravimo eilei vyksta 10 sekundžių žaidimo pradžios atgalinis skaičiavimas. Tai suteikia žaidėjams laiko įkelti stalą, prieš prasidedant tikram eilės laikmačiui.",
        "Šis žaidimo pradžios atgalinis skaičiavimas yra atskiras nuo kiekvienos eilės 10 sekundžių laikmačio."
      ]
    },
    {
      title: "10 sekundžių eilės laikmatis",
      blocks: [
        "Kiekviena žmogaus deklaracija ar ėjimas turi savo 10 sekundžių serverio kontroliuojamą laikmatį.",
        "Laikmatis prasideda tik tada, kai iš tikrųjų yra to žmogaus eilė. Jei prieš kitą žmogų turi veikti botai, serveris pirma sužaidžia botus su trumpa ritmo delsa ir tik tada pradeda žmogaus 10 sekundžių atgalinį skaičiavimą. Tai reiškia, kad žmogus nepraranda laiko laukdamas botų animacijų ar botų eilių užbaigimo.",
        "Serveris yra laiko autoritetas. Klientas rodo atgalinį skaičiavimą, bet serveris nusprendžia, ar veiksmas atvyko prieš terminą.",
        "Jei žaidėjas pateikia deklaraciją ar ėjimą prieš terminą, veiksmas patikrinamas ir priimamas tik tada, jei jis yra teisėtas.",
        "Jei veiksmas atvyksta po termino, serveris jį atmeta kaip per vėlyvą.",
        "Jei laikmatis baigiasi, o žaidėjas nesuveikė, serveris automatiškai išsprendžia eilę, kad žaidimas niekada neužstrigtų:",
        {
          list: [
            "Deklaravimo metu pavėluota deklaracija priverstinai nustatoma į saugią teisėtą deklaraciją, paprastai 0.",
            "Kauliukų žaidimo metu serveris pasirenka ir sužaidžia teisėtą ėjimą už tą žaidėją.",
            "Jei pavėluotu ėjimu užbaigiamas kirtis, serveris nustato kirčio nugalėtoją ir pastumia žaidimą į priekį."
          ]
        },
        "Pakartotinai praleistos eilės veikia žaidėjo neaktyvumo būseną. Po pirmos praleistos eilės žaidėjas pažymimas įspėjimo būsena. Po antros jis laikomas neaktyviu. Po trečios šiam žaidėjui įjungiamas automatinis žaidimas. Grįžęs žaidėjas gali tęsti ir išjungti automatinį žaidimą, kad atgautų rankinį valdymą."
      ]
    },
    {
      title: "Atsijungimai ir pakartotiniai prisijungimai",
      blocks: [
        "Jei žaidėjas atsijungia žaidimo metu, jo vieta iškart nepašalinama. Žaidimas tęsiasi, o būsimas jo eiles gali tvarkyti laiko pabaigos sistema, jei jis laiku negrįžta.",
        "Kai žaidėjas vėl prisijungia su ta pačia naršyklės tapatybe ir pakartotinio prisijungimo žetonu, serveris atkuria jo kambarį, vietą, ryšio būseną ir siunčia naują asmeninį momentinį vaizdą. Tas momentinis vaizdas apima dabartinę žaidimo būseną ir, jei eilė aktyvi, dabartinį eilės terminą.",
        "Jei žaidėjas sąmoningai išeina aktyvaus žaidimo metu, tai laikoma pasidavimu. Jo vieta tampa boto vieta, žaidėjas grąžinamas į vestibiulį ir negali vėl užimti tos pačios vietos. Likę žaidėjai tęsia mačą."
      ]
    },
    {
      title: "Deklaravimas ir žaidimo eiga",
      blocks: [
        "Kiekvienas raundas prasideda deklaravimu. Kiekvienas žaidėjas deklaruoja vieną kartą, pasirinkdamas, kiek iš 7 kirčių tikisi laimėti. Galiojančios deklaracijos yra nuo 0 iki 7.",
        "Pateikus visas deklaracijas, prasideda žaidimo fazė. Žaidėjai žaidžia po vieną domino kiekviename kirtyje. Kiekvieno kirčio nugalėtojas pradeda kitą kirtį.",
        "Serveris patikrina kiekvieną ėjimą. Klientas patogumo dėlei gali paryškinti galimus ėjimus, bet klientas nenusprendžia, kas yra teisėta. Serveris atmeta neteisėtus ėjimus, ne to žaidėjo ėjimus, pasenusius eilės ID ir pavėluotus veiksmus."
      ]
    },
    {
      title: "Kauliukų taisyklės",
      blocks: [
        "Koziriai yra stipriausia kauliukų grupė. Nuo stipriausio iki silpniausio kozirių eilė yra:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Tūzai yra:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Kauliukas 0-6 turi ypatingą dvejopą vaidmenį. Jei jis žaidžiamas ar reikalaujamas kaip 0, jis elgiasi kaip tūzas. Jei jis deklaruojamas kaip 6, jis elgiasi kaip įprastas šešeto kauliukas.",
        "Pradėdamas kirtį, žaidėjas gali pradėti bet kuriuo kauliuku. Jei pradedamasis kauliukas nėra koziris ar dubletas ir turi du skirtingus skaičius, žaidėjas privalo deklaruoti, kurio skaičiaus reikalaujama.",
        "Sekant kirtį:",
        {
          list: [
            "Jei pradėta koziriu, žaidėjai privalo žaisti kozirį, jei jį turi. Jei jie turi stipresnį kozirį nei stipriausias jau esantis kirtyje koziris, jie privalo žaisti stipresnį kozirį.",
            "Jei buvo reikalaujama skaičiaus, žaidėjai privalo sekti tą skaičių ne kozirio kauliuku, jei įmanoma.",
            "Jei jie negali sekti reikalaujamo skaičiaus, jie privalo žaisti kozirį, jei jį turi.",
            "Jei jie negali sekti ir neturi kozirio, jie gali numesti bet kurį kauliuką."
          ]
        }
      ]
    },
    {
      title: "Taškų skaičiavimas",
      blocks: [
        "Po 7 kirčių raundas įvertinamas palyginant kiekvieno žaidėjo deklaraciją su faktiškai laimėtų kirčių skaičiumi.",
        {
          list: [
            "Tiksli deklaracija: 15 taškų už kiekvieną deklaruotą kirtį.",
            "Tiksli deklaracija 7: 105 taškai plius 50 taškų premija.",
            "Daugiau kirčių nei deklaruota: 5 taškai už kiekvieną laimėtą kirtį.",
            "Mažiau kirčių nei deklaruota: -5 taškai už kiekvieną trūkstamą kirtį.",
            "Neįvykdyta deklaracija 7: -50 taškų."
          ]
        },
        "Raundo taškai pridedami prie mačo sumos. Po nustatyto raundų skaičiaus laimi žaidėjas, surinkęs didžiausią bendrą taškų sumą. Jei reikia, žaidimas naudoja lygiųjų išskyrimo kriterijus pagal taškus, deklaraciją, laimėtus kirčius ir vietų eiliškumą nuo dalintojo."
      ]
    },
    {
      title: "Privatumas ir sąžiningumas",
      blocks: [
        "Daugelio žaidėjų serveris yra autoritetinis. Jam priklauso sumaišyta kaladė, žaidimo būsena, laikmačio terminai, teisėtų ėjimų tikrinimas, taškų skaičiavimas ir raundų eiga.",
        "Kiekvienas žaidėjas gauna tik savo ranką. Kitų žaidėjų paslėpti kauliukai į jų momentinius vaizdus neįtraukiami. Vieša informacija apima deklaracijas, laimėtus kirčius, bendrus rezultatus, dabartinį kirtį, baigtus kirčius, žaidėjų būsenas ir kiekvieno žaidėjo likusių kauliukų skaičių.",
        "Daugelio žaidėjų dalijimas generuojamas iš serverio pusės sėklos. Tai daro mačus atkartojamus iš sėklos ir įvykių istorijos, o tai padeda sąžiningumo patikroms, peržaidimui, derinimui ir atkūrimui."
      ]
    },
    {
      title: "Statistika",
      blocks: [
        "Statistika skaičiuojama tik iš daugelio žaidėjų žaidimų, kuriuose visas keturias vietas užima keturi skirtingi registruoti (prisijungę) žaidėjai."
      ]
    }
  ]
};
