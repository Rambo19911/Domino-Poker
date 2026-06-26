import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesDe: MpRulesDoc = {
  intro: [
    "Dieses Spiel ist sehr dynamisch und erfordert ein gutes Verständnis der Spielregeln, um in kurzer Zeit Entscheidungen treffen zu können. Zum Üben wird der Einzelspieler-Modus empfohlen.",
    "Der Mehrspieler-Modus von Domino Poker ist ein Echtzeit-Tischspiel mit vier Plätzen. Jede Partie verwendet einen standardmäßigen Doppel-Sechs-Domino-Satz mit 28 Steinen, von denen je 7 an jeden Platz ausgeteilt werden. Das Spiel kann von vier menschlichen Spielern oder einer Mischung aus Menschen und Bots gespielt werden. Eine Partie kann erst starten, wenn alle vier Plätze besetzt sind und mindestens ein Platz von einem menschlichen Spieler eingenommen wird."
  ],
  sections: [
    {
      title: "Öffentliche und private Räume",
      blocks: [
        "Spieler können entweder einen öffentlichen oder einen privaten Raum erstellen.",
        "Öffentliche Räume sind dafür gedacht, aus der Lobby auffindbar zu sein. Andere Spieler können sie in der Raumliste finden, die Raumansicht öffnen, einen freien Platz wählen und beitreten, solange der Raum noch auf den Start wartet.",
        "Private Räume sind für eingeladene Spieler gedacht. Sie haben den normalen Raumstatus und die normalen Plätze, aber der Beitritt zu einem privaten Raum erfordert den Raumcode. Einem privaten Raum kann man nicht einfach über seine Raum-ID aus dem öffentlichen Lobby-Ablauf beitreten. Der Raumcode wird in der Raumansicht angezeigt und sollte nur mit den Spielern geteilt werden, die du einladen möchtest.",
        "Sowohl öffentliche als auch private Räume unterstützen dieselben Spielregeln, dasselbe Platzsystem, dieselbe Bot-Auffüll-Option und denselben Partieablauf. Der Unterschied liegt in der Auffindbarkeit und im Beitrittszugang: öffentliche Räume sind aus der Lobby beitretbar; private Räume erfordern den Code."
      ]
    },
    {
      title: "Raumplätze und Host-Steuerung",
      blocks: [
        "Jeder Raum hat genau vier Plätze. Der Spieler, der den Raum erstellt, wird zum Host und erhält den ersten Platz. Andere Spieler können freie Plätze einnehmen, während der Raum wartet.",
        "Der Host kann leere Plätze mit Bots auffüllen. Dadurch kann eine Partie auch dann starten, wenn weniger als vier menschliche Spieler verfügbar sind. Der Host ist außerdem der einzige Spieler, der das Spiel starten kann.",
        "Eine Partie kann nicht starten, wenn noch ein Platz leer ist. Versucht der Host, zu früh zu starten, lehnt der Server den Start ab. Die praktische Regel ist einfach: vier besetzte Plätze sind erforderlich, Menschen oder Bots.",
        "Verlässt der Host den Raum, während dieser noch wartet, geht die Host-Rolle auf einen anderen verbleibenden menschlichen Spieler über. Bleibt in einem wartenden Raum kein menschlicher Spieler mehr, wird der Raum zerstört."
      ]
    },
    {
      title: "Goldmünzen und kostenpflichtige Räume",
      blocks: [
        "Räume können kostenlos oder kostenpflichtig sein. Beim Erstellen eines Raums kann ein angemeldeter Host ein Gold-Startgeld festlegen – jeden Betrag bis zu seinem eigenen Guthaben (0 bedeutet einen kostenlosen Raum, der sich genau wie zuvor verhält).",
        "Nur registrierte, angemeldete Spieler können einen Platz in einem kostenpflichtigen Raum einnehmen: sie haben ein Gold-Guthaben. Anonyme Spieler haben keine Geldbörse und können daher kostenpflichtigen Räumen nicht beitreten, kostenlosen Räumen aber weiterhin schon.",
        "Jeder Spieler zahlt das Startgeld in dem Moment, in dem er einen Platz einnimmt, einschließlich des Hosts. Ein Platz kann nur eingenommen werden, wenn das Guthaben das Startgeld deckt. Die gesammelten Gebühren bilden den Preis-Pot des Raums.",
        "Vor dem Spielstart ist das Geld voll erstattungsfähig. Verlässt du deinen Platz, während der Raum noch wartet, löscht der Host den wartenden Raum oder läuft der Raum vor dem Start ab, wird dein Startgeld auf dein Guthaben zurückerstattet.",
        "Sobald das Spiel gestartet ist, ist das Startgeld nicht mehr erstattungsfähig. Verlassen, Aufgeben oder Verbindungsabbruch während der Partie erstattet dein Startgeld nicht – es verbleibt im Pot für die Gewinner.",
        "Wenn die Partie endet, wird der Pot zwischen den besten zwei registrierten menschlichen Spielern nach Gesamtpunktzahl aufgeteilt: 70% für den ersten Platz und 30% für den zweiten. Bots erhalten niemals einen Anteil, und Spieler, die aufgegeben haben, sind ausgeschlossen. Bleibt nur ein registrierter Mensch übrig, erhält dieser Spieler den gesamten Pot.",
        "Verlassen alle Menschen das Spiel und wird die Partie ohne Abschluss abgebrochen, gibt es keinen Gewinner, sodass der Pot nicht ausgezahlt wird.",
        "Das Guthaben, das du siehst, aktualisiert sich live, während du zahlst, eine Erstattung erhältst oder den Pot gewinnst. Der Server ist immer die Autorität über jede Münzbewegung."
      ]
    },
    {
      title: "Ein Raum gleichzeitig",
      blocks: [
        "Ein Spieler kann sich immer nur in einem Raum gleichzeitig befinden. Hat ein Spieler bereits einen Raum erstellt oder ist einem beigetreten, lehnt der Server Versuche ab, einen weiteren Raum zu erstellen oder einem anderen beizutreten, bis dieser Spieler den aktuellen Raum verlässt, ein aktives Spiel aufgibt oder das Spiel endet und der Raum aufgeräumt wird.",
        "Dies verhindert, dass eine einzelne Browser-Identität gleichzeitig Plätze in mehreren Räumen belegt.",
        "Für lokale Tests mit mehreren menschlichen Spielern auf einem Gerät benötigt jeder Spieler eine eigene Browser-Identität, etwa verschiedene Browser oder Inkognito-/Privatfenster."
      ]
    },
    {
      title: "Raumlebensdauer und TTL",
      blocks: [
        "Räume haben eine Lebensdauer (TTL) von 1 Stunde ab der Erstellung.",
        "Wartende, startende, beendete oder zerstörte Räume werden nach Ablauf ihrer TTL aufgeräumt. Die Bereinigung läuft periodisch, sodass die Entfernung kurz nach dem genauen Ablaufzeitpunkt statt auf die exakte Millisekunde geschehen kann.",
        "Aktive, im Spiel befindliche Räume werden nicht allein deshalb zerstört, weil die ursprüngliche TTL abläuft. Ist eine Partie bereits im Gange, darf der Raum zu Ende geführt werden. Nach dem Spielende liefert der Server das endgültige Spielergebnis und zerstört dann den Raum, damit die Spieler frei sind, einen anderen Raum zu erstellen oder ihm beizutreten.",
        "Trennen sich alle menschlichen Spieler von einem aktiven Spiel, gewährt der Server eine kurze Wiederverbindungs-Karenzzeit. Kehrt während dieser Karenzzeit kein Mensch zurück, wird der verlassene Raum zerstört."
      ]
    },
    {
      title: "Das Spiel starten",
      blocks: [
        "Wenn der Host einen vollen Raum startet, erstellt der Server den maßgeblichen Spielzustand und sendet jedem sitzenden menschlichen Spieler seinen eigenen persönlichen Spiel-Snapshot. Jeder Spieler erhält nur seine eigene Hand. Die verdeckten Steine der Gegner werden niemals an andere Spieler gesendet.",
        "Nachdem der Raum ins Spiel übergeht, gibt es einen 10-sekündigen Vorspiel-Countdown, bevor der erste Ansage-Zug beginnt. Dies gibt den Spielern Zeit, den Tisch zu laden, bevor der eigentliche Zug-Timer startet.",
        "Dieser Vorspiel-Countdown ist getrennt vom 10-Sekunden-Timer pro Zug."
      ]
    },
    {
      title: "Der 10-Sekunden-Zug-Timer",
      blocks: [
        "Jede menschliche Ansage oder jeder menschliche Zug hat seinen eigenen 10-sekündigen, servergesteuerten Timer.",
        "Der Timer startet erst, wenn tatsächlich der Zug dieses menschlichen Spielers an der Reihe ist. Müssen Bots agieren, bevor der nächste Mensch dran ist, spielt der Server zuerst die Bots mit einer kurzen Taktverzögerung und startet erst danach den 10-Sekunden-Countdown des menschlichen Spielers. Das bedeutet, dass ein menschlicher Spieler keine Zeit verliert, während er auf Bot-Animationen oder die Auflösung von Bot-Zügen wartet.",
        "Der Server ist die Zeitautorität. Der Client zeigt den Countdown an, aber der Server entscheidet, ob eine Aktion vor der Frist eingetroffen ist.",
        "Reicht ein Spieler eine Ansage oder einen Zug vor der Frist ein, wird die Aktion geprüft und nur dann akzeptiert, wenn sie regelkonform ist.",
        "Trifft die Aktion nach der Frist ein, lehnt der Server sie als zu spät ab.",
        "Läuft der Timer ab und der Spieler hat nicht gehandelt, löst der Server den Zug automatisch auf, damit das Spiel nie stockt:",
        {
          list: [
            "Während der Ansage wird die Timeout-Ansage auf eine sichere, regelkonforme Ansage gezwungen, normalerweise 0.",
            "Während des Steinausspielens wählt und spielt der Server einen regelkonformen Zug für diesen Spieler.",
            "Wird durch den Timeout-Zug ein Stich abgeschlossen, ermittelt der Server den Stichgewinner und bringt das Spiel voran."
          ]
        },
        "Wiederholt verpasste Züge wirken sich auf den Inaktivitätsstatus des Spielers aus. Nach dem ersten verpassten Zug wird der Spieler mit einem Warnstatus markiert. Nach dem zweiten gilt er als inaktiv. Nach dem dritten wird für diesen Spieler das automatische Spiel aktiviert. Ein zurückkehrender Spieler kann fortsetzen und das automatische Spiel deaktivieren, um die manuelle Kontrolle zurückzuerlangen."
      ]
    },
    {
      title: "Verbindungsabbrüche und Wiederverbindungen",
      blocks: [
        "Trennt sich ein Spieler während eines Spiels, wird sein Platz nicht sofort entfernt. Das Spiel geht weiter, und seine künftigen Züge können vom Timeout-System übernommen werden, falls er nicht rechtzeitig zurückkehrt.",
        "Wenn der Spieler sich mit derselben Browser-Identität und demselben Wiederverbindungs-Token erneut verbindet, stellt der Server seinen Raum, seinen Platz und seinen Verbindungsstatus wieder her und sendet einen frischen persönlichen Snapshot. Dieser Snapshot enthält den aktuellen Spielzustand und, falls ein Zug aktiv ist, die aktuelle Zugfrist.",
        "Verlässt ein Spieler ein aktives Spiel absichtlich, wird dies als Aufgabe gewertet. Sein Platz wird zu einem Bot-Platz, der Spieler wird in die Lobby zurückgebracht und kann denselben Platz nicht erneut einnehmen. Die verbleibenden Spieler setzen die Partie fort."
      ]
    },
    {
      title: "Ansage und Spielablauf",
      blocks: [
        "Jede Runde beginnt mit der Ansage. Jeder Spieler sagt einmal an und wählt, wie viele der 7 Stiche er zu gewinnen erwartet. Gültige Ansagen sind 0 bis 7.",
        "Nachdem alle Ansagen gemacht wurden, beginnt die Ausspielphase. Die Spieler spielen einen Domino pro Stich. Der Gewinner jedes Stichs eröffnet den nächsten Stich.",
        "Der Server prüft jeden Zug. Ein Client darf zur Bequemlichkeit mögliche Züge hervorheben, aber der Client entscheidet nicht, was regelkonform ist. Der Server lehnt regelwidrige Züge, Züge des falschen Spielers, veraltete Zug-IDs und verspätete Aktionen ab."
      ]
    },
    {
      title: "Steinregeln",
      blocks: [
        "Trümpfe sind die stärkste Steingruppe. Vom höchsten zum niedrigsten ist die Trumpfreihenfolge:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Asse sind:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Der Stein 0-6 hat eine besondere Doppelrolle. Wird er als 0 gespielt oder verlangt, verhält er sich wie ein As. Wird er als 6 angesagt, verhält er sich wie ein normaler 6er-Stein.",
        "Beim Eröffnen eines Stichs darf ein Spieler mit einem beliebigen Stein eröffnen. Ist der eröffnete Stein kein Trumpf und kein Doppelstein und hat er zwei verschiedene Zahlen, muss der Spieler ansagen, welche Zahl verlangt wird.",
        "Beim Bedienen eines Stichs:",
        {
          list: [
            "Wurde ein Trumpf eröffnet, müssen die Spieler Trumpf spielen, sofern sie einen haben. Haben sie einen stärkeren Trumpf als den stärksten bereits im Stich liegenden Trumpf, müssen sie einen stärkeren Trumpf spielen.",
            "Wurde eine Zahl verlangt, müssen die Spieler diese Zahl nach Möglichkeit mit einem Nicht-Trumpf-Stein bedienen.",
            "Können sie die verlangte Zahl nicht bedienen, müssen sie Trumpf spielen, sofern sie einen haben.",
            "Können sie nicht bedienen und haben keinen Trumpf, dürfen sie einen beliebigen Stein abwerfen."
          ]
        }
      ]
    },
    {
      title: "Wertung",
      blocks: [
        "Nach 7 Stichen wird die Runde gewertet, indem die Ansage jedes Spielers mit der Anzahl der von ihm tatsächlich gewonnenen Stiche verglichen wird.",
        {
          list: [
            "Genaue Ansage: 15 Punkte pro angesagtem Stich.",
            "Genaue Ansage von 7: 105 Punkte plus ein 50-Punkte-Bonus.",
            "Mehr Stiche als angesagt: 5 Punkte pro gewonnenem Stich.",
            "Weniger Stiche als angesagt: -5 Punkte pro fehlendem Stich.",
            "Verfehlte Ansage von 7: -50 Punkte."
          ]
        },
        "Die Rundenpunkte werden zur Partie-Gesamtsumme addiert. Nach der konfigurierten Anzahl an Runden gewinnt der Spieler mit der höchsten Gesamtpunktzahl. Falls nötig, verwendet das Spiel Gleichstands-Kriterien auf Basis von Punktzahl, Ansage, gewonnenen Stichen und Sitzreihenfolge ab dem Geber."
      ]
    },
    {
      title: "Datenschutz und Fairness",
      blocks: [
        "Der Mehrspieler-Server ist maßgeblich. Ihm gehören das gemischte Deck, der Spielzustand, die Timer-Fristen, die Prüfung regelkonformer Züge, die Wertung und der Rundenfortschritt.",
        "Jeder Spieler erhält nur seine eigene Hand. Die verdeckten Steine anderer Spieler sind nicht in ihren Snapshots enthalten. Zu den öffentlichen Informationen gehören Ansagen, gewonnene Stiche, Gesamtpunktzahlen, der aktuelle Stich, abgeschlossene Stiche, Spielerstatus und die verbleibende Steinanzahl jedes Spielers.",
        "Die Mehrspieler-Verteilung wird aus einem serverseitigen Seed generiert. Dadurch sind Partien aus dem Seed und der Ereignishistorie reproduzierbar, was bei Fairness-Prüfungen, Wiederholung, Fehlersuche und Wiederherstellung hilft."
      ]
    },
    {
      title: "Statistik",
      blocks: [
        "Statistiken werden nur aus Mehrspieler-Partien gezählt, in denen alle vier Plätze von vier verschiedenen registrierten (angemeldeten) Spielern besetzt sind."
      ]
    }
  ]
};
