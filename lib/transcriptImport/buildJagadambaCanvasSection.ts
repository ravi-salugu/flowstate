import type { SessionArtifact } from "@/lib/sessionArtifacts";
import type {
  CanvasArtifactNode,
  Card,
  Connection,
  Thread,
} from "@/lib/store";
import {
  claimPayload,
  episodePayload,
  linkGroupPayload,
  mechanismPayload,
  quotePayload,
  statPayload,
} from "@/lib/transcriptArtifacts";
import { layoutChapters } from "@/lib/transcriptImport/chapterLayout";
import {
  conn,
  convCard,
  spawnPayload,
  spawnWebsite,
  thread,
  type TranscriptImportCanvasSection,
} from "@/lib/transcriptImport/playgroundLayout";
import {
  JAGADAMBA_THEATRE_CHAPTERS,
  JAGADAMBA_THEATRE_VIDEO_URL,
} from "@/lib/transcriptImport/jagadambaTheatre";

/*
 * Mr. Jagadish of Jagadamba Theatre on Rooted Stories E1, 34 minutes.
 *
 * The first fixture built from a video with NO creator chapters — the
 * description carries no timestamp list, so YouTube renders no markers and the
 * spine is derived (see JAGADAMBA_THEATRE_CHAPTERS for the cut and the reason
 * it lands on six rather than the formula's three). Derived titles are claims.
 *
 * Two caveats the source forces, both general to ASR captions:
 *
 * 1. No speaker labels. Attribution is read from the turn structure and only
 *    asserted where that structure is unambiguous. It rules out one otherwise
 *    good claim at 23:31 — "if you grow you grow everybody grows together" is
 *    said by the host and echoed by the guest in a single ASR run-on, and there
 *    is no way to tell which half belongs to whom.
 * 2. Mangled proper nouns, heavily — the captions garble every local name. A
 *    resolution appears in a table cell, a timeline label or a card summary
 *    where the context makes it unambiguous ("Chiranji" → Chiranjeevi, "safari
 *    theatre" → the Safire, "Leila Mahal" → Leela Mahal), and never inside a
 *    verbatim field. Two are deliberately left unresolved and unextracted:
 *    "sensor sound" is almost certainly Sensurround, but a definition artifact
 *    puts the name where the claim lives, so the gloss is carried as a quote
 *    instead; and "the only seven theater" reads as 70 mm from context, so the
 *    stat names the format only as "of its format".
 */

const JAGADISH = "Mr. Jagadish";
const HOST = "Vishnu, the host";

export const TIP_THREAD_JAG_MAIN = "tip-thread-jag-main";
export const TIP_THREAD_JAG_ORIGIN = "tip-thread-jag-origin";
export const TIP_THREAD_JAG_BUILD = "tip-thread-jag-build";
export const TIP_THREAD_JAG_OPENING = "tip-thread-jag-opening";
export const TIP_THREAD_JAG_CHILDHOOD = "tip-thread-jag-childhood";
export const TIP_THREAD_JAG_BOMBAY = "tip-thread-jag-bombay";
export const TIP_THREAD_JAG_SURROUND = "tip-thread-jag-surround";
export const TIP_THREAD_JAG_CONSOLE = "tip-thread-jag-console";
export const TIP_THREAD_JAG_DOLBY = "tip-thread-jag-dolby";
export const TIP_THREAD_JAG_STATUE = "tip-thread-jag-statue";
export const TIP_THREAD_JAG_WHATRAN = "tip-thread-jag-whatran";
export const TIP_THREAD_JAG_FANS = "tip-thread-jag-fans";
export const TIP_THREAD_JAG_SAFE = "tip-thread-jag-safe";
export const TIP_THREAD_JAG_TOGETHER = "tip-thread-jag-together";
export const TIP_THREAD_JAG_SCREENS = "tip-thread-jag-screens";
export const TIP_THREAD_JAG_ADVICE = "tip-thread-jag-advice";
export const TIP_THREAD_JAG_SOUND = "tip-thread-jag-sound";
export const TIP_THREAD_JAG_FUTURE = "tip-thread-jag-future";

export function buildJagadambaCanvasSection(): TranscriptImportCanvasSection {
  const cards: Record<string, Card> = {};
  const cardOrder: string[] = [];
  const connections: Connection[] = [];
  const sessionArtifacts: Record<string, SessionArtifact> = {};
  const canvasArtifactNodes: Record<string, CanvasArtifactNode> = {};
  const canvasArtifactOrder: string[] = [];

  const threadIds = [
    TIP_THREAD_JAG_MAIN,
    TIP_THREAD_JAG_ORIGIN,
    TIP_THREAD_JAG_BUILD,
    TIP_THREAD_JAG_OPENING,
    TIP_THREAD_JAG_CHILDHOOD,
    TIP_THREAD_JAG_BOMBAY,
    TIP_THREAD_JAG_SURROUND,
    TIP_THREAD_JAG_CONSOLE,
    TIP_THREAD_JAG_DOLBY,
    TIP_THREAD_JAG_STATUE,
    TIP_THREAD_JAG_WHATRAN,
    TIP_THREAD_JAG_FANS,
    TIP_THREAD_JAG_SAFE,
    TIP_THREAD_JAG_TOGETHER,
    TIP_THREAD_JAG_SCREENS,
    TIP_THREAD_JAG_ADVICE,
    TIP_THREAD_JAG_SOUND,
    TIP_THREAD_JAG_FUTURE,
  ];
  const threads: Record<string, Thread> = {};
  threadIds.forEach((id, index) => {
    threads[id] = thread(id, 4 + index);
  });

  // ---- Chapter heads: the six derived chapters ---------------------------
  const mainDefs = JAGADAMBA_THEATRE_CHAPTERS.map((chapter, index) => ({
    id: `tip-c-jag-main-${index + 1}`,
    title: chapter.title,
  }));
  const summaries = [
    "His first memory of Jagadamba is a projection test on a finished screen in a theatre that had not yet opened, watched at the age of eight. His father already ran the Ramakrishna, but a 1964 trip to the newly opened Safire in Chennai reset what he thought a cinema could be. He bought barren land in 1968 and opened his 70 mm hall eighteen months later.",
    "From twelve he went with his father to the foreign distributors' offices in Mumbai — Warner Brothers, 20th Century, Columbia — every three or four months. They watched previews, chose their films and made the contracts there, then carried them back to Vizag. English titles cost no more than Indian ones: his was the only 70 mm house in the state.",
    "His father put Sensurround on top of 70 mm six-track stereo and opened it with Sholay. The son ran the manual console himself after college, thinking his operator was not giving the audience enough, then taught himself speakers from magazines. Chasing what the Dolby card meant took him to England in 1992, and made Jagadamba India's third Dolby house.",
    "Hollywood occupancies swung along one axis: action filled the hall and comedy emptied it, whatever the same film had done in Bombay for fifty weeks. Jurassic Park was the biggest English run at ten weeks, and Shiva the longest at 155 days, cut short only because the next film was committed. Fans went over the six-foot wall until it was raised.",
    "The business runs on not gambling. They pay the distributor an advance and stop there, never a minimum guarantee, and a film that is not working comes off the following week — which is why he cannot name a disaster. Runs have shortened from four weeks to two, yet more of the films they want now reach them, and the owners do not compete.",
    "He is still changing things behind the screen, swapping speakers whenever a better frequency response appears, and says plainly that he cannot stop himself. He put line arrays back there after hearing them at a Janet Jackson show, and does the room's Dolby equalization himself. Asked about IMAX, he notes it is the 70 mm format he opened with.",
  ];

  mainDefs.forEach((def, index) => {
    cards[def.id] = convCard(
      def.id,
      TIP_THREAD_JAG_MAIN,
      def.title,
      summaries[index]!,
    );
    cardOrder.push(def.id);
  });

  /** A sub-branch: its own thread, hanging off the chapter head. */
  function branch(
    threadId: string,
    parentId: string,
    defs: { id: string; title: string; summary: string }[],
  ) {
    defs.forEach((def, index) => {
      cards[def.id] = convCard(
        def.id,
        threadId,
        def.title,
        def.summary,
        parentId,
      );
      cardOrder.push(def.id);
      connections.push(
        index === 0
          ? conn(parentId, def.id, "bottom", "top")
          : conn(defs[index - 1]!.id, def.id, "right", "left"),
      );
    });
  }

  // ---- Chapter 1 · He saw Sapphire in Chennai ----------------------------
  branch(TIP_THREAD_JAG_ORIGIN, "tip-c-jag-main-1", [
    {
      id: "tip-c-jag-origin-1",
      title: "The screen was ready before the theatre was",
      summary:
        "His first memory of the place predates the place itself. The screen had gone up but the theatre had not opened, and the family sat in the unfinished hall to watch a projection test. He was around eight years old, and by then his father had been running the Ramakrishna theatre for four years.",
    },
    {
      id: "tip-c-jag-origin-2",
      title: "The trip to Chennai in 1964",
      summary:
        "Ramakrishna had been open four years when the family travelled to Chennai in 1964 and saw the newly opened Safire, then playing Cleopatra. The 70 mm format made a difference his father could not unsee, and he decided Vizag should have the same experience and a better one. He started hunting for a site as soon as they were back.",
    },
  ]);
  branch(TIP_THREAD_JAG_BUILD, "tip-c-jag-main-1", [
    {
      id: "tip-c-jag-build-1",
      title: "Barren land, because it needed the space",
      summary:
        "The site was barren land, and it had to be, because what his father had in mind needed the room. This was not a theatre on a plot but an integrated building: a hall with a row of shops below it and a hotel of twenty-three rooms above. He describes it as the first of its kind in India, at a time when the country had neither malls nor multiplexes.",
    },
    {
      id: "tip-c-jag-build-2",
      title: "Eighteen months",
      summary:
        "His father bought the site in 1968 and had the whole complex finished in eighteen months, opening the theatre in 1970. That covered not just the hall but the shops beneath it and the hotel above. He repeats the figure twice in the telling.",
    },
    {
      id: "tip-c-jag-build-3",
      title: "Tough only, and no banks",
      summary:
        "Raising the money was tough, he says, because the investment was a large one. The family already had Ramakrishna and other businesses running, but between them they did not cover what the new complex would cost. They built it without going to the banks at all.",
    },
  ]);
  branch(TIP_THREAD_JAG_OPENING, "tip-c-jag-main-1", [
    {
      id: "tip-c-jag-opening-1",
      title: "A house inside the theatre",
      summary:
        "His father took him along to the site while the complex was going up, and watching the construction he asked whether the family could put their house inside it too, so that he could watch films all day. It is the one request his father never entertained. He was allowed the movies, he clarifies — just not the house.",
    },
    {
      id: "tip-c-jag-opening-2",
      title: "Where Eagles Dare opened it",
      summary:
        "The theatre opened with Where Eagles Dare, starring Richard Burton and Clint Eastwood. It was the 70 mm presentation his father had gone to Chennai and come back determined to build. He remembers the audience in Visakhapatnam having a blast with it — the format was the whole point of the building.",
    },
    {
      id: "tip-c-jag-opening-3",
      title: "A big village with an elite audience",
      summary:
        "Visakhapatnam at the time he describes as a very small place, closer to a big village than a city. Even so, the audience for English films was already there, and there had been a market for them before Jagadamba opened. He remembers a good, elite audience turning up from the first day.",
    },
  ]);

  // ---- Chapter 2 · Buying the films in Bombay ----------------------------
  branch(TIP_THREAD_JAG_CHILDHOOD, "tip-c-jag-main-2", [
    {
      id: "tip-c-jag-childhood-1",
      title: "Over and over and over",
      summary:
        "He went to the theatre all the time — every day, by his own account — and watched the same films over and over again. He describes himself in that period simply as a movie fanatic. Having the hall in the family meant there was nothing to stop him.",
    },
    {
      id: "tip-c-jag-childhood-2",
      title: "International exposure at that age",
      summary:
        "The Hollywood films made a large impact on him, both visually and as something he found thought-provoking. Looking back, he reads it as a good way to have grown up and as international exposure arriving at an age when little else in the city would have offered it. The experience of the hall itself was part of that.",
    },
  ]);
  branch(TIP_THREAD_JAG_BOMBAY, "tip-c-jag-main-2", [
    {
      id: "tip-c-jag-bombay-1",
      title: "The foreign companies' offices",
      summary:
        "From the age of twelve he travelled with his father to the foreign distributors' offices in Mumbai — Warner Brothers, 20th Century, Columbia. They went every three or four months, watched previews, chose what they wanted and made the contracts there. Then they came back to Vizag and played them, and a few months later did it again.",
    },
    {
      id: "tip-c-jag-bombay-2",
      title: "Regal, Metro, Sterling",
      summary:
        "Asked which Mumbai houses played English films the way Jagadamba did, he lists several: Regal, Metro and Sterling. Bombay had more than one such theatre where Vizag had exactly one. Sterling, he notes in passing, was the Tatas' theatre.",
    },
    {
      id: "tip-c-jag-bombay-3",
      title: "At par, on a sharing basis",
      summary:
        "English films were no more expensive to book than Indian ones — at par, he says — and they ran on a sharing basis rather than being bought outright. The leverage ran the other way: the distributors needed a house that could actually show them. Jagadamba was the only 70 mm theatre in Andhra Pradesh at the time.",
    },
  ]);

  // ---- Chapter 3 · He wanted to be the first in India --------------------
  branch(TIP_THREAD_JAG_SURROUND, "tip-c-jag-main-3", [
    {
      id: "tip-c-jag-surround-1",
      title: "Something is really thrown around",
      summary:
        "His father kept adding to the picture and sound systems as new ones appeared, and Sensurround went in on top of the standard 70 mm six-track stereophonic sound. They opened the configuration with Sholay. He describes the effect plainly: when something was thrown around on screen, it seemed as though it were really being thrown around the room.",
    },
    {
      id: "tip-c-jag-surround-2",
      title: "Sholay, twice",
      summary:
        "Leela Mahal had already run the first version of Sholay for a hundred days before Jagadamba got to it. They then played the 70 mm version with Sensurround added and ran it a further fifty days, taking more revenue over those fifty than the original run had. People came back a second time for the sound.",
    },
  ]);
  branch(TIP_THREAD_JAG_CONSOLE, "tip-c-jag-main-3", [
    {
      id: "tip-c-jag-console-1",
      title: "He ran it himself after college",
      summary:
        "Sensurround was manually operated, so somebody had to sit at the console and work it through the film. He did it himself after college, taking the evening show and part of the night show. His reason was not novelty: he thought his operator was not doing a good enough job, and that he could give the audience a better experience.",
    },
    {
      id: "tip-c-jag-console-2",
      title: "Then he started studying speakers",
      summary:
        "Getting good at running the sound led him into studying the speakers themselves. There was no internet, so the information came out of sound design magazines. Whenever a better generation of speakers appeared, he swapped the old ones out and upgraded to it.",
    },
  ]);
  branch(TIP_THREAD_JAG_DOLBY, "tip-c-jag-main-3", [
    {
      id: "tip-c-jag-dolby-1",
      title: "What is this Dolby all about",
      summary:
        "The format card at the end of the Hollywood prints kept saying Dolby stereo, while Jagadamba had 70 mm and four-track. Not knowing what he was missing bothered him enough that he went to Prasad Lab to ask, and they came back with a quote from the UK. They ordered the equipment, and in 1992 he travelled to England to hear what Dolby actually was.",
    },
    {
      id: "tip-c-jag-dolby-2",
      title: "Third in India, first in the South",
      summary:
        "Jagadamba became the third Dolby house in India, after Priya in Delhi and Sterling in Mumbai, and the first anywhere in the South. He does not present that as the achievement it might have been. He had wanted to be first in India, and says so twice.",
    },
  ]);

  // ---- Chapter 4 · Action played, comedy died ----------------------------
  branch(TIP_THREAD_JAG_STATUE, "tip-c-jag-main-4", [
    {
      id: "tip-c-jag-statue-1",
      title: "The discus thrower outside",
      summary:
        "The statue outside is a Greek discus thrower, and it is there because his father was fond of athletes. Ramakrishna had one too — a swordsman with a sword, put up in 1960 — and Jagadamba got the discus thrower when it opened in 1970. He was an athlete himself at one time, throwing javelin, discus and shot put.",
    },
    {
      id: "tip-c-jag-statue-2",
      title: "Enter the Dragon at fifteen",
      summary:
        "He saw Enter the Dragon in a Bombay theatre at fifteen, while he was doing his matriculation. The film was certified over eighteen for violence and he was not allowed in, so they had to know the exhibitor to get him a seat. He calls it the film that changed him, and he started martial arts because of it.",
    },
    {
      id: "tip-c-jag-statue-3",
      title: "Meeting Jackie Chan in Singapore",
      summary:
        "He met Jackie Chan in Singapore at a CineAsia convention, among the actors, producers and large distributors the event brought together. It was around the time of Titanic, which they had a show of. He was there as much a martial artist as an exhibitor — a black belt, and only because of Enter the Dragon.",
    },
  ]);
  branch(TIP_THREAD_JAG_WHATRAN, "tip-c-jag-main-4", [
    {
      id: "tip-c-jag-whatran-1",
      title: "Action yes, comedy never",
      summary:
        "The Hollywood titles did not all behave, and occupancies varied a great deal. Action filled the hall; comedy never did. They would watch a comedy in Mumbai that had been running fifty weeks, bring it back to Vizag with high hopes, and fail to get three days out of it. His reading is that this audience simply lives on action.",
    },
    {
      id: "tip-c-jag-whatran-2",
      title: "The longest runs",
      summary:
        "Jurassic Park was the biggest English blockbuster the theatre had, running ten weeks. The longest Telugu run was Shiva, which held the screen for 155 days. They only took it off because the next film, Donga, was committed and coming in; left alone, he says, it would have run longer still.",
    },
  ]);
  branch(TIP_THREAD_JAG_FANS, "tip-c-jag-main-4", [
    {
      id: "tip-c-jag-fans-1",
      title: "Over the wall",
      summary:
        "The compound wall started at six feet, which turned out not to be enough. Fans climbed it and dropped into the compound on release day, so the wall went up to ten. He mentions it as something that happened with every big film, not once.",
    },
    {
      id: "tip-c-jag-fans-2",
      title: "More sensible now",
      summary:
        "Fans used to be a little erratic, by his account, and are more sensible now. He puts the change down to something the fans worked out for themselves: the heroes they follow are all friendly with one another off screen. If the stars are together, the argument goes, there is little point in their followers fighting.",
    },
    {
      id: "tip-c-jag-fans-3",
      title: "Why they stopped the re-releases",
      summary:
        "Re-releases brought crowds who stood on the seats and jumped on them, and the only way to recover from that is to repair or replace the seats afterwards. Other owners in the city have complained of the same thing. Jagadamba screened them at first and then simply stopped.",
    },
  ]);

  // ---- Chapter 5 · Play safe ---------------------------------------------
  branch(TIP_THREAD_JAG_SAFE, "tip-c-jag-main-5", [
    {
      id: "tip-c-jag-safe-1",
      title: "Change the movie next week",
      summary:
        "Asked to name his biggest disaster, he cannot produce one, and the reason is structural rather than lucky. A film that is not working comes off the screen the following week, before it can take much with it. He describes the whole approach in two words: play safe.",
    },
    {
      id: "tip-c-jag-safe-2",
      title: "No minimum guarantee",
      summary:
        "The exhibitor pays an advance to the distributor, or to the producer directly when there is no distributor, and the exposure stops there. Elsewhere houses commit to a minimum guarantee or a share guarantee and carry the loss themselves when a film flops. He does not take that bet.",
    },
  ]);
  branch(TIP_THREAD_JAG_TOGETHER, "tip-c-jag-main-5", [
    {
      id: "tip-c-jag-together-1",
      title: "Everybody grows together",
      summary:
        "The Vizag exhibitors know each other, meet regularly, and share what they know. He says flatly that there is no sense of competition between them. His account of why is that the city's owners are sane people who play safe, and that when the business grows everybody in it grows together.",
    },
  ]);
  branch(TIP_THREAD_JAG_SCREENS, "tip-c-jag-main-5", [
    {
      id: "tip-c-jag-screens-1",
      title: "Single screens are doing better",
      summary:
        "He reports, with a producer's remark to back it, that the single screens in the city are outperforming the multiplexes. The producer named Jagadamba, Melody and Sarat specifically. It is offered as an observation about the market as it stands rather than a claim about the past.",
    },
    {
      id: "tip-c-jag-screens-2",
      title: "Four weeks became two",
      summary:
        "A film used to hold the screen for four weeks and now holds it for two. He does not treat that as a loss, because the shorter run means more of the films they want actually reach them. Under the old pattern, titles they would have liked to play went by while a long run was still occupying the hall.",
    },
    {
      id: "tip-c-jag-screens-3",
      title: "They come for the experience",
      summary:
        "OTT dented some theatres but not this one, and he puts that down to the hall having an experience of its own that people come for regardless of the film. The seats are part of it — custom-made rather than bought in. He explains the comfort with a joke: he is a big man, so he sized them to himself, and everybody else benefits.",
    },
  ]);

  // ---- Chapter 6 · He still changes the speakers himself -----------------
  branch(TIP_THREAD_JAG_ADVICE, "tip-c-jag-main-6", [
    {
      id: "tip-c-jag-advice-1",
      title: "What he'd tell someone building one",
      summary:
        "Asked what he would tell someone opening a single screen today, his advice is short: build a nice theatre with a big screen and great sound, and serve the public around it. The list of things not to do is shorter still — do not build a small theatre, and do not put in uncomfortable seating. That, he says, is all of it.",
    },
    {
      id: "tip-c-jag-advice-2",
      title: "The first gaming zone in Vizag",
      summary:
        "The complex carried the first gaming zone in Visakhapatnam, running alongside the hall itself. It ran to bikes and cars among the machines. It fits the original idea of the building, which was never meant to be only a place to watch a film.",
    },
  ]);
  branch(TIP_THREAD_JAG_SOUND, "tip-c-jag-main-6", [
    {
      id: "tip-c-jag-sound-1",
      title: "Line arrays behind the screen",
      summary:
        "He heard line array speakers at a Janet Jackson show, decided he wanted them, and put them in behind the screen at Jagadamba. He says the theatre was the first in India to do so. He talks about the result in terms of the dynamic range across the sound frequencies rather than volume.",
    },
    {
      id: "tip-c-jag-sound-2",
      title: "He does the equalization himself",
      summary:
        "He does the room's Dolby equalization himself, having learned it from his engineers and then improvised on what they taught him, and he went to Dolby Labs to ask how to do it better. The speakers get changed whenever something with a better frequency response appears. He says he cannot stop himself.",
    },
  ]);
  branch(TIP_THREAD_JAG_FUTURE, "tip-c-jag-main-6", [
    {
      id: "tip-c-jag-future-1",
      title: "IMAX is 70 mm",
      summary:
        "Asked whether he will take Jagadamba to IMAX, he points out that IMAX is the format he opened with: the same 70 mm film, which he rates above 4K or 8K digital. What IMAX adds is a bigger screen and more of the frame used on that same stock. The theatre started there in 1970, so the question rather inverts itself.",
    },
    {
      id: "tip-c-jag-future-2",
      title: "Word of mouth, not digital",
      summary:
        "The multiplex brands market heavily and digitally; he has always relied on word of mouth instead. His argument is that the thing being advertised is an experience, and an experience does not transfer through an advertisement. If someone goes and the hall does not deliver, no amount of marketing would have convinced them anyway.",
    },
    {
      id: "tip-c-jag-future-3",
      title: "The rooted moment",
      summary:
        "The interview closes on the question the show is named for, after a round of rapid fire. His most rooted moment is the theatre itself. He gives the answer in two words and then extends it — rooted, and still growing.",
    },
  ]);

  /*
   * Artifacts, chapter by chapter, per the transcript-artifacts skill. Every
   * quote and claim side below is a verbatim lift from
   * JAGADAMBA_THEATRE_TRANSCRIPT — enforced by transcriptFidelity.test.ts.
   */
  const spawn = (
    nodeId: string,
    payload: Parameters<typeof spawnPayload>[1],
    cardId: string,
  ) =>
    spawnPayload(
      nodeId,
      payload,
      cardId,
      sessionArtifacts,
      canvasArtifactNodes,
      canvasArtifactOrder,
    );
  const site = (id: string, url: string, title: string, cardId: string) =>
    spawnWebsite(
      id,
      url,
      title,
      cardId,
      sessionArtifacts,
      canvasArtifactNodes,
      canvasArtifactOrder,
    );

  // Chapter 1 — C timeline, D' stat x2, H quote.
  spawn(
    "tip-art-jag-video",
    {
      type: "images",
      title: "The Untold Story of Jagadamba Theatre",
      data: {
        items: [
          {
            kind: "youtube",
            url: JAGADAMBA_THEATRE_VIDEO_URL,
            title: "Mr. Jagadish | Rooted Stories E1",
            thumb: "https://img.youtube.com/vi/mP94mZ5RxEU/hqdefault.jpg",
          },
        ],
      },
    },
    "tip-c-jag-main-1",
  );
  spawn(
    "tip-art-jag-timeline",
    {
      type: "timeline",
      title: "From one theatre to the other",
      data: {
        scale: "year",
        events: [
          {
            id: "jag-t1",
            label: "Ramakrishna theatre opens",
            at: "1960-01-01T12:00:00.000Z",
          },
          {
            id: "jag-t2",
            label: "Chennai: the Safire, playing Cleopatra",
            at: "1964-01-01T12:00:00.000Z",
          },
          {
            id: "jag-t3",
            label: "He buys the site",
            at: "1968-01-01T12:00:00.000Z",
          },
          {
            id: "jag-t4",
            label: "Jagadamba opens",
            at: "1970-01-01T12:00:00.000Z",
            highlight: true,
          },
        ],
      },
    },
    "tip-c-jag-origin-2",
  );
  spawn(
    "tip-art-jag-stat-months",
    statPayload("Construction time", {
      value: "18",
      unit: "months",
      label:
        "From buying the site in '68 to opening the theatre — hall, hotel and shops together",
      speaker: JAGADISH,
    }),
    "tip-c-jag-build-2",
  );
  spawn(
    "tip-art-jag-stat-rooms",
    statPayload("Hotel capacity", {
      value: "23",
      unit: "rooms",
      label:
        "Lodging inside the same building as the shops and the movie theatre, before malls existed here",
      speaker: JAGADISH,
    }),
    "tip-c-jag-build-1",
  );
  spawn(
    "tip-art-jag-quote-house",
    quotePayload("Moving the family in", {
      text: "I told my father let's have our house also in here also",
      speaker: JAGADISH,
      timestamp: "5:26",
      context: "Aged eight, watching the theatre being built — so he could watch movies all day",
    }),
    "tip-c-jag-opening-1",
  );
  site(
    "jag-safire",
    "https://en.wikipedia.org/wiki/Safire_Theatre_complex",
    "Safire Theatre complex, Chennai",
    "tip-c-jag-origin-2",
  );
  site(
    "jag-eagles",
    "https://en.wikipedia.org/wiki/Where_Eagles_Dare",
    "Where Eagles Dare",
    "tip-c-jag-opening-2",
  );
  site(
    "jag-yovizag",
    "https://www.yovizag.com/50-years-of-jagadamba-theatre-vizag/",
    "50 years of Jagadamba",
    "tip-c-jag-main-1",
  );

  // Chapter 2 — E mechanism, D' stat.
  spawn(
    "tip-art-jag-mech-bombay",
    mechanismPayload("How a Hollywood film reached Vizag", {
      steps: [
        {
          id: "trip",
          label: "Every 3 4 months, to Mumbai",
          note: "From the age of twelve, along with his father",
        },
        {
          id: "offices",
          label: "The foreign companies' offices",
          note: "Warner Brothers, 20th Century, Columbia",
        },
        { id: "previews", label: "Watch the previews" },
        { id: "contracts", label: "Choose the movies, make contracts" },
        { id: "play", label: "Come back and play them" },
        { id: "again", label: "Go again for a new project" },
      ],
      edges: [
        { from: "trip", to: "offices" },
        { from: "offices", to: "previews" },
        { from: "previews", to: "contracts" },
        { from: "contracts", to: "play" },
        { from: "play", to: "again" },
      ],
    }),
    "tip-c-jag-bombay-1",
  );
  spawn(
    "tip-art-jag-stat-only",
    statPayload("Standing in the state", {
      value: "The only theatre of its format",
      label:
        "In Andhra Pradesh at the time — which is why the distributors needed them",
      speaker: JAGADISH,
    }),
    "tip-c-jag-bombay-3",
  );
  site(
    "jag-warner",
    "https://www.warnerbros.com",
    "Warner Bros.",
    "tip-c-jag-bombay-1",
  );
  site(
    "jag-regal",
    "https://en.wikipedia.org/wiki/Regal_Cinema",
    "Regal Cinema, Mumbai",
    "tip-c-jag-bombay-2",
  );

  // Chapter 3 — H quote, D' stat, E mechanism, B table.
  spawn(
    "tip-art-jag-quote-surround",
    quotePayload("The surround effect", {
      text:
        "When something is thrown around it would seem like something is really thrown around.",
      speaker: JAGADISH,
      timestamp: "11:15",
      context:
        "Explaining the system his father put on top of 70 mm six-track stereophonic sound",
    }),
    "tip-c-jag-surround-1",
  );
  spawn(
    "tip-art-jag-stat-sholay",
    statPayload("Sholay, the second time", {
      value: "50",
      unit: "days",
      label:
        "Their run of the 70 mm version with the added sound — against 100 days for the first version at Leela Mahal, and with more revenue",
      speaker: JAGADISH,
    }),
    "tip-c-jag-surround-2",
  );
  spawn(
    "tip-art-jag-quote-operator",
    quotePayload("Working the console", {
      text:
        "I wanted to give audience a great experience cuz I thought my operator was not doing a great job.",
      speaker: JAGADISH,
      timestamp: "12:19",
      context: "On coming in after college to work the manual surround",
    }),
    "tip-c-jag-console-1",
  );
  spawn(
    "tip-art-jag-mech-dolby",
    mechanismPayload("How Dolby reached Visakhapatnam", {
      steps: [
        {
          id: "card",
          label: "Dolby stereo on the format card",
          note: "At the end of the Hollywood prints — they had 70 mm and four-track",
        },
        { id: "wonder", label: "Wondered what it was all about" },
        { id: "prasad", label: "Went to Prasad Lab and inquired" },
        { id: "quote", label: "He got a quote from UK" },
        { id: "order", label: "Ordered the equipment" },
        {
          id: "england",
          label: "Went to England in '92",
          note: "To actually hear what Dolby sound is all about",
        },
      ],
      edges: [
        { from: "card", to: "wonder" },
        { from: "wonder", to: "prasad" },
        { from: "prasad", to: "quote" },
        { from: "quote", to: "order" },
        { from: "order", to: "england" },
      ],
    }),
    "tip-c-jag-dolby-1",
  );
  spawn(
    "tip-art-jag-table-dolby",
    {
      type: "table",
      title: "Who got Dolby first",
      data: {
        columns: [
          { key: "theatre", label: "Theatre" },
          { key: "city", label: "City" },
          { key: "position", label: "Position" },
        ],
        rows: [
          { theatre: "Priya", city: "Delhi", position: "First" },
          { theatre: "Sterling", city: "Mumbai", position: "Second" },
          {
            theatre: "Jagadamba",
            city: "Visakhapatnam",
            position: {
              value: "Third",
              tags: [{ label: "First in South India", tone: "success" }],
            },
          },
        ],
      },
    },
    "tip-c-jag-dolby-2",
  );
  site(
    "jag-sholay",
    "https://en.wikipedia.org/wiki/Sholay",
    "Sholay",
    "tip-c-jag-surround-2",
  );
  site(
    "jag-sensurround",
    "https://en.wikipedia.org/wiki/Sensurround",
    "Sensurround",
    "tip-c-jag-surround-1",
  );
  site(
    "jag-dolby",
    "https://www.dolby.com",
    "Dolby Laboratories",
    "tip-c-jag-dolby-1",
  );

  // Chapter 4 — B table, D' stat, H quote, E mechanism.
  spawn(
    "tip-art-jag-table-runs",
    {
      type: "table",
      title: "The longest runs at Jagadamba",
      data: {
        columns: [
          { key: "film", label: "Film" },
          { key: "language", label: "Language" },
          { key: "run", label: "Run" },
          { key: "note", label: "Note" },
        ],
        rows: [
          {
            film: "Jurassic Park",
            language: "English",
            run: {
              value: "10 weeks",
              tags: [{ label: "Biggest English blockbuster", tone: "info" }],
            },
            note: "The first one",
          },
          {
            film: "Shiva",
            language: "Telugu",
            run: {
              value: "155 days",
              tags: [{ label: "Longest run", tone: "success" }],
            },
            note: "Terminated for the next film — otherwise it would have gone longer",
          },
        ],
      },
    },
    "tip-c-jag-whatran-2",
  );
  spawn(
    "tip-art-jag-stat-wall",
    statPayload("The compound wall", {
      value: "10 ft",
      label: "Raised after fans kept jumping the old one on release day",
      delta: { from: "6 ft", to: "10 ft" },
      speaker: JAGADISH,
    }),
    "tip-c-jag-fans-1",
  );
  spawn(
    "tip-art-jag-quote-dragon",
    quotePayload("Enter the Dragon, at fifteen", {
      text: "That movie changed me.",
      speaker: JAGADISH,
      timestamp: "17:53",
      context:
        "He was under the age limit and got in through the exhibitor; he went on to a black belt",
    }),
    "tip-c-jag-statue-2",
  );
  spawn(
    "tip-art-jag-mech-rereleases",
    mechanismPayload("Why they stopped screening re-releases", {
      steps: [
        { id: "screen", label: "Initially they screened those movies" },
        { id: "jump", label: "Standing on the seats, jumping on the seats" },
        { id: "repair", label: "Repair or change the seats afterwards" },
        { id: "stop", label: "Now they stopped screening them" },
      ],
      edges: [
        { from: "screen", to: "jump" },
        { from: "jump", to: "repair" },
        { from: "repair", to: "stop" },
      ],
    }),
    "tip-c-jag-fans-3",
  );
  site(
    "jag-dragon",
    "https://en.wikipedia.org/wiki/Enter_the_Dragon",
    "Enter the Dragon",
    "tip-c-jag-statue-2",
  );
  site(
    "jag-shiva",
    "https://en.wikipedia.org/wiki/Shiva_(1989_Telugu_film)",
    "Shiva (1989)",
    "tip-c-jag-whatran-2",
  );

  // Chapter 5 — E mechanism, F claim, D' stat, H quote.
  spawn(
    "tip-art-jag-mech-money",
    mechanismPayload("How the money actually moves", {
      steps: [
        { id: "producer", label: "The producer makes the film" },
        { id: "distributor", label: "The distributor buys it from the producer" },
        {
          id: "advance",
          label: "The exhibitor pays an advance",
          note: "Or pays the producer directly when there is no distributor",
        },
        {
          id: "play",
          label: "Play it — and change the movie next week if it fails",
        },
        {
          id: "nomg",
          label: "No minimum guarantee, no share guarantee",
          note: "Elsewhere the exhibitor is the one who loses when the film flops",
        },
      ],
      edges: [
        { from: "producer", to: "distributor" },
        { from: "distributor", to: "advance" },
        { from: "advance", to: "play" },
        { from: "play", to: "nomg" },
      ],
    }),
    "tip-c-jag-safe-2",
  );
  spawn(
    "tip-art-jag-claim-covid",
    claimPayload("Did COVID hit the single screens harder?", {
      topic: "Whether single screens took more damage than multiplexes during COVID",
      proposition: {
        speaker: HOST,
        text:
          "during co a lot of single screens were affected. Multiplexes still had backing and all",
        timestamp: "24:12",
      },
      counter: {
        speaker: JAGADISH,
        text: "Nothing like that. It was happening for both of us.",
        timestamp: "24:20",
      },
    }),
    "tip-c-jag-screens-1",
  );
  spawn(
    "tip-art-jag-stat-weeks",
    statPayload("Run length per film", {
      value: "2 weeks",
      label:
        "Down from four — but more of the films they could not previously play are now reaching them",
      delta: { from: "4 weeks", to: "2 weeks" },
      speaker: JAGADISH,
    }),
    "tip-c-jag-screens-2",
  );
  spawn(
    "tip-art-jag-quote-single",
    quotePayload("Single screens vs multiplexes", {
      text: "actually our single screens are doing better than multiplexes",
      speaker: JAGADISH,
      timestamp: "23:56",
      context: "Asked whether the arrival of multiplexes hurt the business",
    }),
    "tip-c-jag-screens-1",
  );

  // Chapter 6 — I todo, H quote, F claim, B table.
  spawn(
    "tip-art-jag-todo-advice",
    {
      type: "todo",
      title: "If you were building a theatre today",
      data: {
        items: [
          {
            id: "jag-a1",
            label: "Make a nice theatre with a big screen and great sound",
            checked: false,
          },
          {
            id: "jag-a2",
            label: "Serve the public around your theatre",
            checked: false,
          },
          { id: "jag-a3", label: "Don't make a small theatre", checked: false },
          { id: "jag-a4", label: "No uncomfortable seating", checked: false },
        ],
      },
    },
    "tip-c-jag-advice-1",
  );
  spawn(
    "tip-art-jag-quote-speakers",
    quotePayload("Upgrading the speakers", {
      text: "I change it. I can't stop myself.",
      speaker: JAGADISH,
      timestamp: "28:01",
      context: "On what he is still doing behind the screen, half a century in",
    }),
    "tip-c-jag-sound-1",
  );
  spawn(
    "tip-art-jag-claim-imax",
    claimPayload("Is IMAX the future, or the format he already has?", {
      topic: "Whether Jagadamba should move to IMAX",
      proposition: {
        speaker: HOST,
        text: "they're saying that future is the IMAX experience",
        timestamp: "29:31",
      },
      counter: {
        speaker: JAGADISH,
        text:
          "Jagamba originally started as a 70 mm theater with the 70 mm film.",
        timestamp: "29:40",
      },
    }),
    "tip-c-jag-future-1",
  );
  spawn(
    "tip-art-jag-table-rapid",
    {
      type: "table",
      title: "Rapid fire",
      data: {
        columns: [
          { key: "q", label: "Question" },
          { key: "a", label: "Answer" },
        ],
        rows: [
          { q: "Tea or coffee?", a: "Used to be coffee, now it's tea" },
          { q: "Mountains or beaches?", a: "Beaches" },
          { q: "Morning or night person?", a: "Night person" },
          {
            q: "Favourite hero",
            a: "Chiranjeevi in Telugu, Amitabh in Hindi",
          },
          { q: "Favourite movie of all time", a: "Enter the Dragon" },
        ],
      },
    },
    "tip-c-jag-future-3",
  );
  site("jag-imax", "https://www.imax.com", "IMAX", "tip-c-jag-future-1");
  site(
    "jag-atmos",
    "https://www.dolby.com/technologies/dolby-atmos/",
    "Dolby Atmos",
    "tip-c-jag-sound-2",
  );

  // Sticky notes — the annotation layer, one per chapter at most.
  spawn(
    "tip-art-jag-sticky-origin",
    {
      type: "stickynote",
      title: "The seed",
      data: {
        text: "One trip to Chennai in 1964 is the whole origin. Everything after it is an attempt to better what he saw there.",
        colorId: "turbo",
      },
    },
    "tip-c-jag-origin-2",
  );
  spawn(
    "tip-art-jag-sticky-sound",
    {
      type: "stickynote",
      title: "The through-line",
      data: {
        text: "He buys the sound before the audience asks for it. Sensurround, then Dolby, then line arrays — the same move, three decades apart.",
        colorId: "chalk",
      },
    },
    "tip-c-jag-dolby-2",
  );
  spawn(
    "tip-art-jag-sticky-taste",
    {
      type: "stickynote",
      title: "What Vizag turned up for",
      data: {
        text: "Action filled the hall. The same comedies that ran 50 weeks in Bombay could not hold three days here.",
        colorId: "violet",
      },
    },
    "tip-c-jag-whatran-1",
  );
  spawn(
    "tip-art-jag-sticky-owner",
    {
      type: "stickynote",
      title: "Still hands-on",
      data: {
        text: "Half a century on, the owner does the room's Dolby equalization himself — learned from his engineers, then improvised on.",
        colorId: "haiti",
      },
    },
    "tip-c-jag-sound-2",
  );

  /*
   * The masthead: what the video is, a clickable index into the six chapter
   * groups, and the link directory.
   *
   * The chapter rows carry the group ids layoutChapters will generate
   * (`${idPrefix}-chapter-${n}`), so clicking one frames that chapter. The
   * chapter labels are ours rather than the creator's, because this description
   * ships no timestamps — the start times come from where the cuts were made.
   *
   * The description carries no URLs either, so the directory is built from what
   * the conversation actually points at.
   */
  const MASTHEAD_NODE_IDS = ["tip-art-jag-episode", "tip-art-jag-links"];

  spawn(
    "tip-art-jag-episode",
    episodePayload("The episode", {
      videoTitle:
        "The Untold Story of Jagadamba Theatre ft. Mr. Jagadish | Rooted Stories E1",
      channel: "Rooted Growth Co",
      duration: "34:06",
      url: JAGADAMBA_THEATRE_VIDEO_URL,
      thumb: "https://img.youtube.com/vi/mP94mZ5RxEU/maxresdefault.jpg",
      description:
        "Episode one of Rooted Stories: the proprietor of Jagadamba Theatre on how a 1964 trip to Chennai became Visakhapatnam's first 70 mm hall, and on fifty years of buying films, chasing sound and watching the audience change.",
      chapters: JAGADAMBA_THEATRE_CHAPTERS.map((chapter, index) => ({
        label: chapter.title,
        start: chapter.start,
        groupId: `tip-jag-chapter-${index + 1}`,
      })),
    }),
    "tip-c-jag-main-1",
  );
  spawn(
    "tip-art-jag-links",
    linkGroupPayload("Affiliated links", {
      sections: [
        {
          label: "The show",
          links: [
            { label: "This episode", url: JAGADAMBA_THEATRE_VIDEO_URL },
            { label: "Rooted Growth Co", url: "https://www.youtube.com/@Rooted4vizag" },
          ],
        },
        {
          label: "The theatres",
          links: [
            {
              label: "50 years of Jagadamba",
              url: "https://www.yovizag.com/50-years-of-jagadamba-theatre-vizag/",
            },
            {
              label: "Safire Theatre complex",
              url: "https://en.wikipedia.org/wiki/Safire_Theatre_complex",
            },
            {
              label: "Regal Cinema, Mumbai",
              url: "https://en.wikipedia.org/wiki/Regal_Cinema",
            },
          ],
        },
        {
          label: "What played",
          links: [
            {
              label: "Where Eagles Dare",
              url: "https://en.wikipedia.org/wiki/Where_Eagles_Dare",
            },
            { label: "Sholay", url: "https://en.wikipedia.org/wiki/Sholay" },
            {
              label: "Enter the Dragon",
              url: "https://en.wikipedia.org/wiki/Enter_the_Dragon",
            },
            {
              label: "Jurassic Park",
              url: "https://en.wikipedia.org/wiki/Jurassic_Park_(film)",
            },
            {
              label: "Shiva (1989)",
              url: "https://en.wikipedia.org/wiki/Shiva_(1989_Telugu_film)",
            },
          ],
        },
        {
          label: "The formats",
          links: [
            { label: "Sensurround", url: "https://en.wikipedia.org/wiki/Sensurround" },
            { label: "Dolby Laboratories", url: "https://www.dolby.com" },
            { label: "IMAX", url: "https://www.imax.com" },
          ],
        },
      ],
    }),
    "tip-c-jag-main-1",
  );

  const layout = layoutChapters({
    mainCardIds: mainDefs.map((def) => def.id),
    mastheadNodeIds: MASTHEAD_NODE_IDS,
    cards,
    cardOrder,
    connections,
    canvasArtifactNodes,
    canvasArtifactOrder,
    sessionArtifacts,
    idPrefix: "tip-jag",
  });

  return {
    cards,
    cardOrder,
    connections: layout.connections,
    threads,
    threadOrder: threadIds,
    groups: layout.groups,
    sessionArtifacts,
    canvasArtifactNodes,
    canvasArtifactOrder,
    contentCenter: layout.contentCenter,
  };
}
