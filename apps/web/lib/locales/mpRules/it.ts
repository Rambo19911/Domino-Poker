import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesIt: MpRulesDoc = {
  intro: [
    "Questo gioco è molto dinamico e richiede una buona conoscenza delle regole per poter prendere decisioni in poco tempo. Per allenarsi si consiglia di giocare in modalità giocatore singolo.",
    "Il multigiocatore di Domino Poker è un gioco da tavolo in tempo reale con quattro posti. Ogni partita usa un set di domino standard doppio-sei con 28 tessere, distribuite come 7 tessere a ciascun posto. La partita può essere giocata da quattro giocatori umani, oppure da un misto di umani e bot. Una partita può iniziare solo quando tutti e quattro i posti sono occupati e almeno un posto è occupato da un giocatore umano."
  ],
  sections: [
    {
      title: "Stanze pubbliche e private",
      blocks: [
        "I giocatori possono creare una stanza pubblica o privata.",
        "Le stanze pubbliche sono pensate per essere trovate dalla lobby. Gli altri giocatori possono trovarle nell'elenco delle stanze, aprire la vista della stanza, scegliere un posto libero ed entrare mentre la stanza è ancora in attesa di iniziare.",
        "Le stanze private sono destinate ai giocatori invitati. Hanno comunque il normale stato della stanza e i posti, ma per entrare in una stanza privata è necessario il codice della stanza. A una stanza privata non si può entrare semplicemente usando il suo id dal flusso della lobby pubblica. Il codice della stanza è mostrato nella vista della stanza e va condiviso solo con i giocatori che vuoi invitare.",
        "Sia le stanze pubbliche sia quelle private supportano le stesse regole di gioco, lo stesso sistema di posti, la stessa opzione di riempimento con bot e lo stesso svolgimento della partita. La differenza è la reperibilità e l'accesso: alle stanze pubbliche si può entrare dalla lobby; le stanze private richiedono il codice."
      ]
    },
    {
      title: "Posti della stanza e controlli dell'host",
      blocks: [
        "Ogni stanza ha esattamente quattro posti. Il giocatore che crea la stanza diventa l'host e viene collocato nel primo posto. Gli altri giocatori possono occupare i posti disponibili mentre la stanza è in attesa.",
        "L'host può riempire i posti vuoti con i bot. Questo consente di avviare una partita anche se sono disponibili meno di quattro giocatori umani. L'host è anche l'unico giocatore che può avviare la partita.",
        "Una partita non può iniziare se un posto è ancora vuoto. Se l'host prova ad avviare troppo presto, il server rifiuta l'avvio. La regola pratica è semplice: servono quattro posti occupati, da umani o bot.",
        "Se l'host esce mentre la stanza è ancora in attesa, il ruolo di host passa a un altro giocatore umano rimasto. Se non resta alcun giocatore umano in una stanza in attesa, la stanza viene eliminata."
      ]
    },
    {
      title: "Monete d'oro e stanze a pagamento",
      blocks: [
        "Le stanze possono essere gratuite o a pagamento. Quando crea una stanza, un host che ha effettuato l'accesso può impostare una quota d'ingresso in oro — qualsiasi importo fino al proprio saldo (0 significa una stanza gratuita, che si comporta esattamente come prima).",
        "Solo i giocatori registrati che hanno effettuato l'accesso possono prendere un posto in una stanza a pagamento: hanno un saldo di oro. I giocatori anonimi non hanno un portafoglio, quindi non possono entrare nelle stanze a pagamento, ma possono comunque entrare nelle stanze gratuite.",
        "Ogni giocatore paga la quota d'ingresso nel momento in cui prende un posto, incluso l'host. Un posto può essere preso solo se il saldo copre la quota. Le quote raccolte formano il piatto in palio della stanza.",
        "Prima dell'inizio della partita il denaro è completamente rimborsabile. Se lasci il tuo posto mentre la stanza è ancora in attesa, l'host elimina la stanza in attesa, oppure la stanza scade prima di iniziare, la tua quota d'ingresso viene restituita al tuo saldo.",
        "Una volta iniziata la partita, la quota d'ingresso non è più rimborsabile. Uscire, abbandonare o disconnettersi durante la partita non restituisce la tua quota — resta nel piatto per i vincitori.",
        "Quando la partita finisce, il piatto viene diviso tra i due migliori giocatori umani registrati per punteggio totale: 70% al primo posto e 30% al secondo. I bot non ricevono mai una quota, e i giocatori che hanno abbandonato sono esclusi. Se resta un solo umano registrato, quel giocatore prende l'intero piatto.",
        "Se tutti gli umani escono e la partita viene abbandonata senza finire, non c'è vincitore, quindi il piatto non viene pagato.",
        "Il saldo che vedi si aggiorna in tempo reale mentre paghi, ricevi un rimborso o vinci il piatto. Il server è sempre l'autorità su ogni movimento di monete."
      ]
    },
    {
      title: "Una stanza alla volta",
      blocks: [
        "Un giocatore può trovarsi in una sola stanza alla volta. Se un giocatore ha già creato o si è già unito a una stanza, il server rifiuterà i tentativi di creare un'altra stanza o di entrarne in una diversa finché quel giocatore non lascia la stanza attuale, non abbandona una partita attiva, oppure la partita non finisce e la stanza non viene ripulita.",
        "Questo impedisce a una singola identità del browser di occupare posti in più stanze contemporaneamente.",
        "Per i test locali con più giocatori umani su una sola macchina, ogni giocatore ha bisogno di un'identità del browser separata, come browser diversi o finestre in incognito/private."
      ]
    },
    {
      title: "Durata della stanza e TTL",
      blocks: [
        "Le stanze hanno una durata di vita (TTL) di 1 ora dalla creazione.",
        "Le stanze in attesa, in avvio, terminate o eliminate vengono ripulite dopo la scadenza del loro TTL. La pulizia viene eseguita periodicamente, quindi la rimozione può avvenire poco dopo l'orario esatto di scadenza anziché al millisecondo preciso.",
        "Le stanze attive in partita non vengono eliminate solo perché è passato il TTL originale. Se una partita è già in corso, alla stanza è consentito terminare. Dopo la fine della partita, il server consegna il risultato finale e poi elimina la stanza, così i giocatori sono liberi di creare o entrare in un'altra stanza.",
        "Se tutti i giocatori umani si disconnettono da una partita attiva, il server concede un breve periodo di grazia per la riconnessione. Se nessun umano torna durante quel periodo di grazia, la stanza abbandonata viene eliminata."
      ]
    },
    {
      title: "Avvio della partita",
      blocks: [
        "Quando l'host avvia una stanza piena, il server crea lo stato autoritativo della partita e invia a ogni giocatore umano seduto la propria istantanea personale della partita. Ogni giocatore riceve solo la propria mano. Le tessere nascoste degli avversari non vengono mai inviate agli altri giocatori.",
        "Dopo che la stanza entra in partita, c'è un conto alla rovescia pre-partita di 10 secondi prima che inizi il primo turno di dichiarazione. Questo dà ai giocatori il tempo di caricare il tavolo prima che parta il vero timer del turno.",
        "Questo conto alla rovescia pre-partita è separato dal timer di 10 secondi per ogni turno."
      ]
    },
    {
      title: "Il timer del turno di 10 secondi",
      blocks: [
        "Ogni dichiarazione o mossa di un umano ha il proprio timer di 10 secondi controllato dal server.",
        "Il timer parte solo quando è effettivamente il turno di quel giocatore umano. Se i bot devono agire prima del prossimo umano, il server gioca prima i bot, con un breve ritardo di ritmo, e solo allora avvia il conto alla rovescia di 10 secondi del giocatore umano. Questo significa che un giocatore umano non perde tempo mentre aspetta le animazioni dei bot o lo svolgimento dei turni dei bot.",
        "Il server è l'autorità sul tempo. Il client mostra il conto alla rovescia, ma è il server a decidere se un'azione è arrivata prima della scadenza.",
        "Se un giocatore invia una dichiarazione o una mossa prima della scadenza, l'azione viene convalidata e accettata solo se è legale.",
        "Se l'azione arriva dopo la scadenza, il server la rifiuta perché in ritardo.",
        "Se il timer scade e il giocatore non ha agito, il server risolve automaticamente il turno così la partita non si blocca mai:",
        {
          list: [
            "Durante la dichiarazione, la dichiarazione per scadenza viene forzata a una dichiarazione legale sicura, normalmente 0.",
            "Durante il gioco delle tessere, il server sceglie e gioca una mossa legale per quel giocatore.",
            "Se una presa viene completata dalla mossa per scadenza, il server determina il vincitore della presa e fa avanzare la partita."
          ]
        },
        "I turni mancati ripetuti influenzano lo stato di inattività del giocatore. Dopo il primo turno mancato il giocatore viene contrassegnato con uno stato di avviso. Dopo il secondo, viene considerato inattivo. Dopo il terzo, viene attivato il gioco automatico per quel giocatore. Un giocatore che torna può riprendere e disattivare il gioco automatico per riottenere il controllo manuale."
      ]
    },
    {
      title: "Disconnessioni e riconnessioni",
      blocks: [
        "Se un giocatore si disconnette durante una partita, il suo posto non viene rimosso immediatamente. La partita continua, e i suoi turni futuri possono essere gestiti dal sistema di scadenza se non torna in tempo.",
        "Quando il giocatore si riconnette con la stessa identità del browser e lo stesso token di riconnessione, il server ripristina la sua stanza, il posto, lo stato di connessione e invia una nuova istantanea personale. Quell'istantanea include lo stato attuale della partita e, se un turno è attivo, la scadenza del turno corrente.",
        "Se un giocatore lascia deliberatamente durante una partita attiva, ciò viene considerato un abbandono. Il suo posto diventa un posto da bot, il giocatore viene riportato alla lobby e non può rioccupare lo stesso posto. I giocatori rimasti continuano la partita."
      ]
    },
    {
      title: "Dichiarazione e svolgimento del gioco",
      blocks: [
        "Ogni mano inizia con la dichiarazione. Ogni giocatore dichiara una volta, scegliendo quante delle 7 prese si aspetta di vincere. Le dichiarazioni valide vanno da 0 a 7.",
        "Dopo che tutte le dichiarazioni sono state fatte, inizia la fase di gioco. I giocatori giocano un domino per presa. Chi vince ogni presa apre la presa successiva.",
        "Il server convalida ogni mossa. Un client può evidenziare le mosse possibili per comodità, ma non è il client a decidere cosa è legale. Il server rifiuta le mosse illegali, le mosse del giocatore sbagliato, gli id di turno obsoleti e le azioni in ritardo."
      ]
    },
    {
      title: "Regole delle tessere",
      blocks: [
        "Le briscole sono il gruppo di tessere più forte. Dalla più alta alla più bassa, l'ordine delle briscole è:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Gli assi sono:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "La tessera 0-6 ha un ruolo doppio speciale. Se viene giocata o richiesta come 0, si comporta come un asso. Se viene dichiarata come 6, si comporta come una normale tessera 6.",
        "Quando apre una presa, un giocatore può aprire con qualsiasi tessera. Se la tessera aperta non è una briscola o un doppio, e ha due numeri diversi, il giocatore deve dichiarare quale numero viene richiesto.",
        "Quando si segue una presa:",
        {
          list: [
            "Se è stata aperta una briscola, i giocatori devono giocare briscola se ne hanno una. Se hanno una briscola più forte della briscola più forte già nella presa, devono giocare una briscola più forte.",
            "Se è stato richiesto un numero, i giocatori devono seguire quel numero con una tessera non di briscola se possibile.",
            "Se non possono seguire il numero richiesto, devono giocare briscola se ne hanno una.",
            "Se non possono seguire e non hanno briscola, possono scartare qualsiasi tessera."
          ]
        }
      ]
    },
    {
      title: "Punteggio",
      blocks: [
        "Dopo 7 prese, la mano viene valutata confrontando la dichiarazione di ogni giocatore con il numero di prese effettivamente vinte.",
        {
          list: [
            "Dichiarazione esatta: 15 punti per presa dichiarata.",
            "Dichiarazione esatta di 7: 105 punti più un bonus di 50 punti.",
            "Più prese di quante dichiarate: 5 punti per presa vinta.",
            "Meno prese di quante dichiarate: -5 punti per presa mancante.",
            "Dichiarazione di 7 fallita: -50 punti."
          ]
        },
        "I punteggi della mano vengono sommati al totale della partita. Dopo il numero di mani configurato, vince il giocatore con il punteggio totale più alto. Se necessario, la partita usa criteri di spareggio basati su punteggio, dichiarazione, prese vinte e ordine dei posti a partire dal mazziere."
      ]
    },
    {
      title: "Privacy ed equità",
      blocks: [
        "Il server multigiocatore è autoritativo. Possiede il mazzo mescolato, lo stato della partita, le scadenze del timer, la convalida delle mosse legali, il punteggio e la progressione delle mani.",
        "Ogni giocatore riceve solo la propria mano. Le tessere nascoste degli altri giocatori non sono incluse nelle loro istantanee. Le informazioni pubbliche includono le dichiarazioni, le prese vinte, i punteggi totali, la presa attuale, le prese completate, gli stati dei giocatori e il numero di tessere rimaste a ciascun giocatore.",
        "La distribuzione del multigiocatore è generata da un seed lato server. Questo rende le partite riproducibili dal seed e dalla cronologia degli eventi, il che aiuta nei controlli di equità, nel replay, nel debug e nel ripristino."
      ]
    },
    {
      title: "Statistiche",
      blocks: [
        "Le statistiche vengono conteggiate solo dalle partite multigiocatore in cui tutti e quattro i posti sono occupati da quattro distinti giocatori registrati (con accesso effettuato)."
      ]
    }
  ]
};
