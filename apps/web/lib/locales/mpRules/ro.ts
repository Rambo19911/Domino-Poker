import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesRo: MpRulesDoc = {
  intro: [
    "Acest joc este foarte dinamic și necesită o bună înțelegere a regulilor pentru a putea lua decizii într-un timp scurt. Pentru antrenament, se recomandă să joci în modul un singur jucător.",
    "Domino Poker multiplayer este un joc de masă în timp real cu patru locuri. Fiecare partidă folosește un set standard de domino dublu-șase cu 28 de piese, împărțite câte 7 piese fiecărui loc. Jocul poate fi jucat de patru jucători umani sau de un amestec de oameni și boți. O partidă poate începe doar când toate cele patru locuri sunt ocupate și cel puțin un loc este ocupat de un jucător uman."
  ],
  sections: [
    {
      title: "Camere publice și private",
      blocks: [
        "Jucătorii pot crea fie o cameră publică, fie una privată.",
        "Camerele publice sunt menite să fie descoperite din lobby. Ceilalți jucători le pot găsi în lista de camere, pot deschide vederea camerei, pot alege un loc liber și se pot alătura cât timp camera încă așteaptă să înceapă.",
        "Camerele private sunt destinate jucătorilor invitați. Au tot starea normală a camerei și locuri, dar alăturarea la o cameră privată necesită codul camerei. O cameră privată nu poate fi accesată doar folosind id-ul camerei din fluxul lobby-ului public. Codul camerei este afișat în vederea camerei și ar trebui partajat doar cu jucătorii pe care vrei să-i inviți.",
        "Atât camerele publice, cât și cele private suportă aceleași reguli de joc, același sistem de locuri, aceeași opțiune de completare cu boți și aceeași desfășurare a partidei. Diferența constă în descoperire și accesul de alăturare: camerele publice pot fi accesate din lobby; cele private necesită codul."
      ]
    },
    {
      title: "Locurile camerei și controalele gazdei",
      blocks: [
        "Fiecare cameră are exact patru locuri. Jucătorul care creează camera devine gazdă și este așezat pe primul loc. Ceilalți jucători se pot alătura locurilor disponibile cât timp camera așteaptă.",
        "Gazda poate completa locurile libere cu boți. Astfel un joc poate începe chiar dacă sunt disponibili mai puțin de patru jucători umani. Gazda este, de asemenea, singurul jucător care poate începe jocul.",
        "Un joc nu poate începe dacă vreun loc este încă liber. Dacă gazda încearcă să înceapă prea devreme, serverul respinge pornirea. Regula practică este simplă: sunt necesare patru locuri ocupate, oameni sau boți.",
        "Dacă gazda părăsește camera cât timp aceasta încă așteaptă, calitatea de gazdă trece la un alt jucător uman rămas. Dacă nu mai rămâne niciun jucător uman într-o cameră în așteptare, camera este distrusă."
      ]
    },
    {
      title: "Monede de aur și camere cu plată",
      blocks: [
        "Camerele pot fi gratuite sau cu plată. La crearea unei camere, o gazdă autentificată poate stabili o taxă de intrare în aur — orice sumă până la propriul sold (0 înseamnă o cameră gratuită, care se comportă exact ca înainte).",
        "Doar jucătorii înregistrați și autentificați pot ocupa un loc într-o cameră cu plată: ei au un sold de aur. Jucătorii anonimi nu au portofel, așa că nu se pot alătura camerelor cu plată, dar se pot alătura în continuare camerelor gratuite.",
        "Fiecare jucător plătește taxa de intrare în momentul în care ocupă un loc, inclusiv gazda. Un loc poate fi ocupat doar dacă soldul acoperă taxa. Taxele colectate formează potul de premii al camerei.",
        "Înainte de începerea jocului, banii sunt complet rambursabili. Dacă îți părăsești locul cât timp camera încă așteaptă, gazda șterge camera în așteptare sau camera expiră înainte de a începe, taxa ta de intrare este returnată în sold.",
        "Odată ce jocul începe, taxa de intrare nu mai este rambursabilă. Părăsirea, abandonul sau deconectarea în timpul partidei nu îți returnează taxa — aceasta rămâne în pot pentru câștigători.",
        "Când partida se termină, potul este împărțit între primii doi jucători umani înregistrați după punctajul total: 70% pentru locul întâi și 30% pentru locul doi. Boții nu primesc niciodată o parte, iar jucătorii care au abandonat sunt excluși. Dacă rămâne un singur jucător uman înregistrat, acel jucător ia tot potul.",
        "Dacă toți oamenii pleacă și partida este abandonată fără a se termina, nu există câștigător, așa că potul nu este plătit.",
        "Soldul pe care îl vezi se actualizează în timp real pe măsură ce plătești, primești rambursări sau câștigi potul. Serverul este întotdeauna autoritatea asupra fiecărei mișcări de monedă."
      ]
    },
    {
      title: "O singură cameră pe rând",
      blocks: [
        "Un jucător poate fi într-o singură cameră pe rând. Dacă un jucător a creat sau s-a alăturat deja unei camere, serverul va respinge încercările de a crea altă cameră sau de a se alătura unei alte camere până când acel jucător părăsește camera curentă, abandonează un joc activ sau jocul se termină și camera este curățată.",
        "Acest lucru împiedică o singură identitate de browser să ocupe locuri în mai multe camere simultan.",
        "Pentru testarea locală cu mai mulți jucători umani pe o singură mașină, fiecare jucător are nevoie de o identitate de browser separată, cum ar fi browsere diferite sau ferestre incognito/private."
      ]
    },
    {
      title: "Durata de viață a camerei și TTL",
      blocks: [
        "Camerele au o durată de viață de 1 oră de la creare.",
        "Camerele în așteptare, în pornire, finalizate sau distruse sunt curățate după expirarea TTL-ului lor. Curățarea rulează periodic, așa că eliminarea poate avea loc la scurt timp după momentul exact de expirare, nu exact la milisecundă.",
        "Camerele active aflate în joc nu sunt distruse doar pentru că a trecut TTL-ul inițial. Dacă o partidă este deja în desfășurare, camerei i se permite să se termine. După încheierea jocului, serverul livrează rezultatul final al jocului și apoi distruge camera, astfel încât jucătorii să fie liberi să creeze sau să se alăture altei camere.",
        "Dacă toți jucătorii umani se deconectează de la un joc activ, serverul oferă o scurtă perioadă de grație pentru reconectare. Dacă niciun om nu se întoarce în acea perioadă de grație, camera abandonată este distrusă."
      ]
    },
    {
      title: "Începerea jocului",
      blocks: [
        "Când gazda pornește o cameră plină, serverul creează starea autoritară a jocului și trimite fiecărui jucător uman așezat propriul instantaneu personal al jocului. Fiecare jucător primește doar propria mână. Piesele ascunse ale adversarilor nu sunt trimise niciodată altor jucători.",
        "După ce camera intră în joc, există o numărătoare inversă de 10 secunde înainte de partidă, înainte ca primul tur de licitație să înceapă. Aceasta le oferă jucătorilor timp să încarce masa înainte ca cronometrul real al turului să pornească.",
        "Această numărătoare inversă dinaintea partidei este separată de cronometrul de 10 secunde per tur."
      ]
    },
    {
      title: "Cronometrul de tur de 10 secunde",
      blocks: [
        "Fiecare anunț sau mutare a unui om are propriul cronometru de 10 secunde controlat de server.",
        "Cronometrul pornește doar atunci când este efectiv rândul acelui jucător uman. Dacă boții trebuie să acționeze înaintea următorului om, serverul joacă mai întâi boții, cu o scurtă întârziere de ritm, și abia apoi pornește numărătoarea inversă de 10 secunde a jucătorului uman. Asta înseamnă că un jucător uman nu pierde timp în timp ce așteaptă animațiile boților sau rezolvarea turilor boților.",
        "Serverul este autoritatea asupra timpului. Clientul afișează numărătoarea inversă, dar serverul decide dacă o acțiune a sosit înainte de termenul-limită.",
        "Dacă un jucător trimite un anunț sau o mutare înainte de termenul-limită, acțiunea este validată și acceptată doar dacă este legală.",
        "Dacă acțiunea sosește după termenul-limită, serverul o respinge ca fiind prea târzie.",
        "Dacă cronometrul expiră și jucătorul nu a acționat, serverul rezolvă automat turul, astfel încât jocul să nu se blocheze niciodată:",
        {
          list: [
            "În timpul licitației, anunțul prin expirare este forțat la un anunț legal sigur, de regulă 0.",
            "În timpul jocului pieselor, serverul alege și joacă o mutare legală pentru acel jucător.",
            "Dacă o levată este completată prin mutarea de expirare, serverul stabilește câștigătorul levatei și avansează jocul."
          ]
        },
        "Turile ratate în mod repetat afectează statusul de inactivitate al jucătorului. După primul tur ratat, jucătorul este marcat cu o stare de avertizare. După al doilea, este considerat inactiv. După al treilea, se activează jocul automat pentru acel jucător. Un jucător care se întoarce poate relua și dezactiva jocul automat pentru a recâștiga controlul manual."
      ]
    },
    {
      title: "Deconectări și reconectări",
      blocks: [
        "Dacă un jucător se deconectează în timpul unui joc, locul său nu este eliminat imediat. Jocul continuă, iar turile sale viitoare pot fi gestionate de sistemul de expirare dacă nu se întoarce la timp.",
        "Când jucătorul se reconectează cu aceeași identitate de browser și același token de reconectare, serverul îi restaurează camera, locul, starea conexiunii și trimite un instantaneu personal nou. Acel instantaneu include starea curentă a jocului și, dacă un tur este activ, termenul-limită al turului curent.",
        "Dacă un jucător părăsește în mod deliberat în timpul unui joc activ, asta este tratată ca un abandon. Locul său devine un loc de bot, jucătorul este întors în lobby și nu se poate realătura aceluiași loc. Jucătorii rămași continuă partida."
      ]
    },
    {
      title: "Licitație și desfășurarea jocului",
      blocks: [
        "Fiecare rundă începe cu licitația. Fiecare jucător licitează o singură dată, alegând câte dintre cele 7 levate se așteaptă să câștige. Anunțurile valide sunt de la 0 la 7.",
        "După ce toate anunțurile sunt plasate, începe faza de joc. Jucătorii joacă câte un domino pe levată. Câștigătorul fiecărei levate deschide următoarea levată.",
        "Serverul validează fiecare mutare. Un client poate evidenția mutările posibile pentru comoditate, dar clientul nu decide ce este legal. Serverul respinge mutările ilegale, mutările jucătorului greșit, id-urile de tur învechite și acțiunile întârziate."
      ]
    },
    {
      title: "Reguli pentru piese",
      blocks: [
        "Atuurile sunt cel mai puternic grup de piese. De la cel mai puternic la cel mai slab, ordinea atuurilor este:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Așii sunt:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Piesa 0-6 are un rol dublu special. Dacă este jucată sau cerută ca 0, se comportă ca un as. Dacă este declarată ca 6, se comportă ca o piesă obișnuită de 6.",
        "Când deschide o levată, un jucător poate deschide cu orice piesă. Dacă piesa deschisă nu este un atu sau un dublu și are două numere diferite, jucătorul trebuie să declare care număr este cerut.",
        "Când urmează o levată:",
        {
          list: [
            "Dacă s-a deschis cu atu, jucătorii trebuie să joace atu dacă au unul. Dacă au un atu mai puternic decât cel mai puternic atu deja în levată, trebuie să joace un atu mai puternic.",
            "Dacă a fost cerut un număr, jucătorii trebuie să urmeze acel număr cu o piesă care nu este atu, dacă este posibil.",
            "Dacă nu pot urma numărul cerut, trebuie să joace atu dacă au unul.",
            "Dacă nu pot urma și nu au atu, pot descărca orice piesă."
          ]
        }
      ]
    },
    {
      title: "Punctaj",
      blocks: [
        "După 7 levate, runda este punctată comparând anunțul fiecărui jucător cu numărul de levate pe care le-a câștigat efectiv.",
        {
          list: [
            "Anunț exact: 15 puncte per levată anunțată.",
            "Anunț exact de 7: 105 puncte plus un bonus de 50 de puncte.",
            "Mai multe levate decât anunțul: 5 puncte per levată câștigată.",
            "Mai puține levate decât anunțul: -5 puncte per levată ratată.",
            "Anunț de 7 ratat: -50 de puncte."
          ]
        },
        "Punctele rundei sunt adăugate la totalul partidei. După numărul configurat de runde, câștigă jucătorul cu cel mai mare punctaj total. Dacă este necesar, jocul folosește criterii de departajare bazate pe punctaj, anunț, levate câștigate și ordinea locurilor pornind de la împărțitor."
      ]
    },
    {
      title: "Confidențialitate și corectitudine",
      blocks: [
        "Serverul multiplayer este autoritar. El deține pachetul amestecat, starea jocului, termenele-limită ale cronometrului, validarea mutărilor legale, punctajul și progresia rundelor.",
        "Fiecare jucător primește doar propria mână. Piesele ascunse ale celorlalți jucători nu sunt incluse în instantaneele lor. Informațiile publice includ anunțurile, levatele câștigate, punctajele totale, levata curentă, levatele finalizate, statusurile jucătorilor și numărul de piese rămase ale fiecărui jucător.",
        "Împărțirea în multiplayer este generată dintr-o sămânță de pe partea serverului. Astfel, partidele devin reproductibile din sămânță și din istoricul evenimentelor, ceea ce ajută la verificările de corectitudine, reluare, depanare și recuperare."
      ]
    },
    {
      title: "Statistici",
      blocks: [
        "Statisticile se contabilizează doar din jocurile multiplayer în care toate cele patru locuri sunt ocupate de patru jucători înregistrați (autentificați) distincți."
      ]
    }
  ]
};
