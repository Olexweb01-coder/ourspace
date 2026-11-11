// Every game question, built in. No AI, no internet, no cost.
// IDs never change, so old games keep working when new questions are added.

export type GameKind = "wyr" | "tot" | "know";
export type DeckKind = "truth" | "dare" | "deep";
export type Question = { id: string; q: string; options: string[] };

const pairs = (prefix: string, prompt: string, list: [string, string][]): Question[] =>
  list.map(([a, b], i) => ({ id: `${prefix}${i + 1}`, q: prompt, options: [a, b] }));

export const WOULD_YOU_RATHER: Question[] = pairs("wyr", "Would you rather", [
  ["Breakfast in bed every Sunday", "Dinner out every Friday"],
  ["A beach holiday", "A cabin in the mountains"],
  ["Always know what I'm thinking", "Always know what I'm feeling"],
  ["A surprise party", "A quiet night for two"],
  ["Slow dance in the kitchen", "Sing together in the car"],
  ["Handwritten love letters", "A voice note every morning"],
  ["Travel the world together", "Build our dream home"],
  ["Relive our first date", "Peek at us ten years from now"],
  ["Cook together", "Be cooked for"],
  ["Wear matching outfits for a day", "Swap phones for a day"],
  ["A long phone call", "A long walk together"],
  ["Plan every detail of a trip", "Book a trip with zero plans"],
  ["Stay up all night talking", "Wake up early for the sunrise"],
  ["A fancy restaurant", "A street food adventure"],
  ["Our song on repeat forever", "A new song for us every day"],
  ["A big wedding", "A small wedding"],
  ["Cuddle through a scary movie", "Laugh through a comedy"],
  ["A weekend with no phones", "A weekend with no plans"],
  ["Live by the sea", "Live in a big city"],
  ["A poem written for me", "A playlist made for me"],
  ["Always get the last word", "Always get the last bite"],
  ["Dance at every wedding", "Watch everyone else dance"],
  ["Be famous together", "Be quietly happy together"],
  ["A road trip", "A train journey"],
  ["Rain on the window and a movie", "Sunshine and a picnic"],
  ["Learn a language together", "Learn a dance together"],
  ["Hold hands everywhere", "Steal kisses when no one's looking"],
  ["A dog", "A cat"],
  ["Breakfast for dinner", "Dinner for breakfast"],
  ["Know our whole future", "Be surprised by every day"],
  ["Matching tattoos", "Matching rings"],
  ["Spend a day as each other", "Read each other's minds for a day"],
  ["A house full of plants", "A house full of books"],
  ["A snowy holiday", "A safari"],
  ["Text all day", "One long call at night"],
  ["Get lost in a new city together", "Show each other our favourite places"],
  ["A movie night in", "A night out dancing"],
  ["Grow old by the beach", "Grow old in the countryside"],
  ["Always be early", "Always be fashionably late"],
  ["Win a dream holiday", "Win a dream home"],
]);

export const THIS_OR_THAT: Question[] = pairs("tot", "This or that", [
  ["Tea", "Coffee"], ["Sunrise", "Sunset"], ["Jollof rice", "Fried rice"], ["Beach", "Pool"],
  ["Movies", "Series"], ["Sweet", "Savoury"], ["Mornings", "Late nights"], ["Cats", "Dogs"],
  ["Calls", "Texts"], ["Rain", "Sunshine"], ["Books", "Podcasts"], ["Cuddles", "Kisses"],
  ["Pizza", "Suya"], ["Dancing", "Singing"], ["City", "Village"], ["Plantain", "Yam"],
  ["Rainy season", "Harmattan"], ["Afrobeats", "Amapiano"], ["Chocolate", "Vanilla"], ["Stay in", "Go out"],
  ["Ice cream", "Cake"], ["Shoes", "Bags"], ["Window seat", "Aisle seat"], ["Hugs", "Holding hands"],
  ["Sneakers", "Sandals"], ["Board games", "Video games"], ["Spicy", "Mild"], ["Big party", "Small dinner"],
  ["Road trip", "Flight"], ["Breakfast", "Dinner"], ["Mountains", "Ocean"], ["Gold", "Silver"],
  ["Pancakes", "Puff-puff"], ["Romance films", "Action films"], ["Cook at home", "Order in"], ["Photos", "Videos"],
  ["Sweet words", "Thoughtful gifts"], ["Surprises", "Plans"], ["Fanta", "Coke"], ["Gospel", "R&B"],
]);

export const KNOW_ME: Question[] = ([
  ["My ideal date night", ["Dinner out", "A movie at home", "Dancing", "A long drive"]],
  ["When I'm stressed I need", ["A hug", "Some space", "To talk it out", "Food"]],
  ["How I most love to receive love", ["Sweet words", "Touch", "Gifts", "Time together"]],
  ["The first thing I do in the morning", ["Check my phone", "Pray or reflect", "Brush my teeth", "Snooze the alarm"]],
  ["My comfort food", ["Jollof rice", "Pizza", "Noodles", "Something sweet"]],
  ["If I won a million, I'd first buy", ["A house", "A car", "A trip", "Something for you"]],
  ["My dream holiday", ["A beach", "A big city", "A safari", "Snowy mountains"]],
  ["I'm most likely to cry at", ["A sad movie", "A wedding", "A song", "I never cry"]],
  ["My biggest pet peeve", ["Lateness", "Loud chewing", "Being ignored", "Mess"]],
  ["On a lazy Sunday I'd rather", ["Sleep in", "Go out", "Binge a series", "Cook something special"]],
  ["The season I love most", ["Rainy season", "Harmattan", "Hot and sunny", "Christmas time"]],
  ["My go-to drink", ["Water", "Tea or coffee", "A soft drink", "Juice or a smoothie"]],
  ["What makes me laugh the most", ["Silly jokes", "Funny videos", "You", "Embarrassing stories"]],
  ["I fall asleep fastest when", ["Cuddling", "After a long day", "Listening to music", "Watching something"]],
  ["The music I play most", ["Afrobeats", "Gospel", "R&B", "A bit of everything"]],
  ["The gift I'd love most", ["Jewellery", "Clothes", "A trip", "Something handmade"]],
  ["When we disagree I usually", ["Need time to cool off", "Want to fix it right away", "Go quiet", "Try to make you laugh"]],
  ["I feel my best when", ["I'm dressed up", "I've just woken up rested", "I get a compliment", "I'm doing what I love"]],
  ["My hidden talent", ["Cooking", "Singing", "Dancing", "Making people laugh"]],
  ["My favourite time of day", ["Early morning", "Afternoon", "Evening", "Late night"]],
  ["If I could live anywhere", ["Right here", "Abroad", "By the sea", "Somewhere quiet"]],
  ["The thing I'd grab in a fire", ["My phone", "Old photos", "My documents", "Just you"]],
  ["My social battery", ["Always charged", "Charged with close friends", "Drains quickly", "Depends on the day"]],
  ["My biggest fear", ["Heights", "Losing people I love", "Failing", "Small spaces"]],
  ["How I like my birthday", ["A big party", "Dinner with close friends", "A quiet day with you", "A trip"]],
  ["Where my money usually goes", ["Food", "Fashion", "Experiences", "Savings"]],
  ["When I'm sick I want", ["To be pampered", "To be left alone", "Pepper soup", "Lots of check-ins"]],
  ["My dream job as a child", ["Doctor", "Pilot", "Musician", "Teacher"]],
  ["How I show love most", ["Sweet words", "Touch", "Gifts", "Doing things for you"]],
  ["The first thing I noticed about you", ["Your smile", "Your eyes", "Your voice", "Your energy"]],
] as [string, string[]][]).map(([q, options], i) => ({ id: `know${i + 1}`, q, options }));

export const DECKS: Record<DeckKind, { title: string; lead: string; prefix: string; cards: string[] }> = {
  truth: {
    title: "Truth",
    lead: "Sweet questions to answer honestly.",
    prefix: "Truth for you",
    cards: [
      "What was your very first impression of me?",
      "When did you first know you liked me?",
      "What's a small thing I do that always makes you smile?",
      "What's one thing you've never told me?",
      "What's your favourite memory of us so far?",
      "What's something you want us to try together?",
      "Which of my habits secretly annoys you?",
      "What do you think I'm best at?",
      "What's the best gift you've ever received?",
      "What's a song that reminds you of me?",
      "What's the most romantic thing you've imagined us doing?",
      "When do you feel closest to me?",
      "What's a dream you haven't told anyone about?",
      "What's something you'd like me to do more often?",
      "What do you love most about us?",
      "What's the silliest thing you've ever done to impress someone?",
      "If you could relive one day with me, which would it be?",
      "What makes you feel most loved by me?",
      "What's a fear you'd like me to help you with?",
      "What did you think about the night after our first date?",
      "What's one thing about me you'd never change?",
      "What's your most embarrassing moment?",
      "Which of your friends do you think likes me most?",
      "What's the sweetest thing anyone has ever said to you?",
      "What do you want our life to look like in five years?",
      "What's a compliment you'd love to hear more often?",
      "What's the last thing that made you a little jealous?",
      "What's a childhood memory that shaped who you are?",
      "What's your secret comfort show or song?",
      "If we had a theme song, what would it be?",
    ],
  },
  dare: {
    title: "Dare",
    lead: "Playful little challenges. Send one and see what happens.",
    prefix: "Dare for you",
    cards: [
      "Send me a voice note singing our song.",
      "Write me a four-line love poem right now.",
      "Send the latest photo in your gallery that has me in it.",
      "Describe me in three words, then explain each one.",
      "Text your best friend something nice about me.",
      "Do your best impression of me in a voice note.",
      "Plan our next date in one message, with every detail.",
      "Send me a selfie with your best heart face.",
      "Tell me three things you love about me in a voice note.",
      "Make a photo of us your phone wallpaper for a day.",
      "Send me your most dramatic love declaration as a voice note.",
      "Recreate the first message you ever sent me.",
      "Let me choose your profile picture for 24 hours.",
      "Send me the song you'd want at our wedding.",
      "Write a five-star review of me, like I'm a restaurant.",
      "Tell me a joke. If I don't laugh, you owe me a kiss.",
      "Send a photo of something that reminds you of me.",
      "Give me a nickname I've never heard before.",
      "Say \"I love you\" in a language you don't speak.",
      "Describe our dream house, room by room.",
      "Do a ten-second dance and send me the video.",
      "Write me a note and hide it where I'll find it later.",
      "Make me a three-song playlist right now.",
      "Tell me your favourite thing about my laugh.",
      "Promise me one sweet thing this week, and keep it.",
    ],
  },
  deep: {
    title: "Deep talk",
    lead: "Questions that bring you closer. Take your time with them.",
    prefix: "Let's talk",
    cards: [
      "What does a perfect ordinary day with me look like?",
      "What's something you've changed your mind about since we met?",
      "What do you need from me on a hard day?",
      "Which moment made you most proud of us?",
      "What's a value you never want us to lose?",
      "How did your family show love when you were growing up?",
      "What's one goal you want us to reach this year?",
      "What does home feel like to you?",
      "How could I support your dreams better?",
      "What are you most grateful for today?",
      "What's a memory you hope we never forget?",
      "When do you feel most like yourself?",
      "What are you still learning about love?",
      "What scares you about the future, and what excites you?",
      "How do you want us to handle disagreements?",
      "What's one tradition you'd love us to start?",
      "What does trust mean to you?",
      "What part of yourself are you working on right now?",
      "What would you love people to say about us one day?",
      "What small kindness changed your day recently?",
      "What's the bravest thing you've ever done?",
      "How can I make you feel more appreciated?",
      "What has your past taught you about relationships?",
      "Is there a dream you gave up on that you'd try again?",
      "What does a good apology look like to you?",
      "What's your favourite way for us to spend time together?",
      "What three words do you hope describe our home?",
      "What's something you've never felt ready to talk about?",
      "What would you do with a free year and no limits?",
      "How do you recharge, and how can I help?",
      "What's one thing you'd love us to learn together?",
      "When did you last feel truly at peace?",
      "What belief guides your life the most?",
      "What do you want to be remembered for?",
      "What's something about me you'd like to understand better?",
      "What made you first feel safe with me?",
      "How has being together changed you?",
      "What's a risk you'd like us to take together?",
      "What's your idea of a perfect anniversary?",
      "What do you think makes love last?",
    ],
  },
};

export const GAME_INFO: Record<GameKind, { title: string; lead: string; rounds: number; bank: Question[] }> = {
  wyr: { title: "Would you rather", lead: "Ten dilemmas. See how often you pick the same.", rounds: 10, bank: WOULD_YOU_RATHER },
  tot: { title: "This or that", lead: "Ten quick picks. No overthinking.", rounds: 10, bank: THIS_OR_THAT },
  know: { title: "How well do you know me", lead: "You answer about yourself. They guess.", rounds: 8, bank: KNOW_ME },
};

const ALL = new Map<string, Question>([...WOULD_YOU_RATHER, ...THIS_OR_THAT, ...KNOW_ME].map((q) => [q.id, q]));

// ---------------- Generated questions ----------------
// Hand-picked lists the app combines into fresh questions on the phone. IDs describe the combination,
// so any phone can rebuild the exact same question later. Add items to the END of a list only.

const LISTS = {
  food: ["Jollof rice", "Fried rice", "Pounded yam", "Amala", "Suya", "Shawarma", "Pizza", "Burgers", "Pasta", "Noodles",
    "Moi moi", "Akara", "Plantain", "Pepper soup", "Egusi", "Ofada rice", "Small chops", "Grilled fish", "Chicken wings", "Tacos"],
  treats: ["Ice cream", "Cake", "Chocolate", "Puff-puff", "Chin chin", "Doughnuts", "Cookies", "Popcorn", "Meat pie",
    "Fruit salad", "Pancakes", "Waffles"],
  drinks: ["Zobo", "Chapman", "Tea", "Coffee", "Hot chocolate", "Smoothies", "Coconut water", "Lemonade", "Malt", "Milkshakes"],
  dates: ["A movie night", "A picnic", "A rooftop dinner", "Karaoke", "A beach day", "A cooking class", "Bowling",
    "An art gallery", "A spa day", "A long drive", "Stargazing", "A concert", "A comedy show", "Board games", "A boat ride", "Paint and sip"],
  places: ["Paris", "Zanzibar", "Cape Town", "Dubai", "Accra", "Bali", "London", "New York", "Marrakech", "Tokyo",
    "Santorini", "Nairobi", "Rio", "Mauritius"],
  music: ["Afrobeats", "Amapiano", "Gospel", "R&B", "Highlife", "Jazz", "Hip-hop", "Fuji", "Reggae", "Pop",
    "Old-school love songs", "Afro-soul"],
  everyday: ["Early nights", "Late nights", "Cooking", "Cleaning", "Laundry", "Grocery shopping", "The gym", "Long walks",
    "Reading", "Gaming", "Naps", "Journaling"],
  gifts: ["Flowers", "Perfume", "A watch", "Jewellery", "A handwritten letter", "Shoes", "A surprise trip", "A photo album",
    "Concert tickets", "A spa voucher", "Clothes", "A new gadget"],
  moments: ["Sunrise", "Sunset", "Rainy days", "Sunny days", "Harmattan mornings", "Starry nights", "Breezy evenings", "Misty mornings"],
  films: ["Romance", "Comedy", "Action", "Horror", "Thrillers", "Animation", "Nollywood classics", "Documentaries", "K-dramas", "Musicals"],
  chores: ["Cooking", "Cleaning the bathroom", "Laundry", "Washing dishes", "Grocery shopping", "Ironing", "Taking out the trash", "Making the bed"],
} as const;
type ListKey = keyof typeof LISTS;
const TOT_LISTS: ListKey[] = ["food", "treats", "drinks", "dates", "places", "music", "everyday", "gifts", "moments", "films"];

const WYR_FRAMES = ["Spend a whole weekend", "Spend every Sunday for a month", "Spend our next anniversary", "Spend a rainy day"];
const WYR_ACTIVITIES = ["cooking together", "dancing in the living room", "exploring a new city", "at the beach",
  "binge-watching a series", "on a road trip", "at a spa", "trying new restaurants", "in bed with snacks and films",
  "hiking somewhere green", "at a music festival", "learning something new together", "with our friends",
  "with no phones at all", "taking photos everywhere", "playing games", "at a fancy hotel", "visiting family",
  "planning our future", "reading side by side", "stargazing", "on a boat", "at a karaoke bar", "building something together"];

const KNOW_PROMPTS: Partial<Record<ListKey, string>> = {
  food: "The meal I'd pick tonight", treats: "My favourite treat", drinks: "My go-to drink right now",
  dates: "The date I'd love most", places: "Where I'd fly tomorrow if I could", music: "What I could listen to all day",
  gifts: "The gift that would make me smile most", moments: "My favourite kind of moment", films: "The film I'd choose for a night in",
  chores: "The chore I'd happily never do again",
};
const KNOW_LISTS = Object.keys(KNOW_PROMPTS) as ListKey[];

function generated(id: string): Question | null {
  const parts = id.split(":");
  const n = (v: string) => (/^\d+$/.test(v) ? Number(v) : -1);
  if (parts[0] === "tg" && parts.length === 4) {
    const list = LISTS[parts[1] as ListKey];
    const a = n(parts[2]), b = n(parts[3]);
    if (!list || a < 0 || b < 0 || a === b || a >= list.length || b >= list.length) return null;
    return { id, q: "This or that", options: [list[a], list[b]] };
  }
  if (parts[0] === "wg" && parts.length === 4) {
    const f = n(parts[1]), a = n(parts[2]), b = n(parts[3]);
    if (f < 0 || f >= WYR_FRAMES.length || a < 0 || b < 0 || a === b || a >= WYR_ACTIVITIES.length || b >= WYR_ACTIVITIES.length) return null;
    return { id, q: "Would you rather", options: [`${WYR_FRAMES[f]} ${WYR_ACTIVITIES[a]}`, `${WYR_FRAMES[f]} ${WYR_ACTIVITIES[b]}`] };
  }
  if (parts[0] === "kg" && parts.length === 3) {
    const key = parts[1] as ListKey;
    const list = LISTS[key];
    const prompt = KNOW_PROMPTS[key];
    const idx = parts[2].split(".").map(n);
    if (!list || !prompt || idx.length !== 4 || new Set(idx).size !== 4 || idx.some((i) => i < 0 || i >= list.length)) return null;
    return { id, q: prompt, options: idx.map((i) => list[i]) };
  }
  return null;
}

export const questionById = (id: string) => ALL.get(id) ?? generated(id);

const rand = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
const shuffle = <T,>(a: T[]) => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = rand(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

function randomGenerated(kind: GameKind): string {
  if (kind === "tot") {
    const key = TOT_LISTS[rand(TOT_LISTS.length)];
    const len = LISTS[key].length;
    const a = rand(len); let b = rand(len - 1); if (b >= a) b++;
    return `tg:${key}:${a}:${b}`;
  }
  if (kind === "wyr") {
    const len = WYR_ACTIVITIES.length;
    const a = rand(len); let b = rand(len - 1); if (b >= a) b++;
    return `wg:${rand(WYR_FRAMES.length)}:${a}:${b}`;
  }
  const key = KNOW_LISTS[rand(KNOW_LISTS.length)];
  const picks = shuffle(Array.from({ length: LISTS[key].length }, (_, i) => i)).slice(0, 4);
  return `kg:${key}:${picks.join(".")}`;
}

/** Same pair in either order, or the same quiz prompt, counts as already played. */
function familyOf(id: string): string {
  const p = id.split(":");
  if (p[0] === "tg") return `tg:${p[1]}:${[p[2], p[3]].sort().join(":")}`;
  if (p[0] === "wg") return `wg:${p[1]}:${[p[2], p[3]].sort().join(":")}`;
  if (p[0] === "kg") return `kg:${p[1]}`;
  return id;
}

/** How many different questions exist for each game, for the "never repeat" promise. */
export function poolSize(kind: GameKind): number {
  const pairs = (n: number) => (n * (n - 1)) / 2;
  if (kind === "tot") return THIS_OR_THAT.length + TOT_LISTS.reduce((s, k) => s + pairs(LISTS[k].length), 0);
  if (kind === "wyr") return WOULD_YOU_RATHER.length + WYR_FRAMES.length * pairs(WYR_ACTIVITIES.length);
  return KNOW_ME.length + KNOW_LISTS.length;
}

/**
 * About 60% hand-written and 40% generated, never anything either of you has played before
 * (until literally everything has been played, then the oldest come back).
 */
export function pickQuestions(kind: GameKind, played: Set<string>): string[] {
  const { bank, rounds } = GAME_INFO[kind];
  const playedFamilies = new Set(Array.from(played, familyOf));
  const handFresh = shuffle(bank.filter((q) => !played.has(q.id)));
  const chosen: string[] = [];
  const families = new Set<string>();
  const add = (id: string) => {
    const f = familyOf(id);
    if (families.has(f)) return false;
    families.add(f); chosen.push(id); return true;
  };

  for (const q of handFresh.slice(0, Math.ceil(rounds * 0.6))) add(q.id);
  for (let tries = 0; chosen.length < rounds && tries < 400; tries++) {
    const id = randomGenerated(kind);
    if (playedFamilies.has(familyOf(id))) continue;
    add(id);
  }
  for (const q of handFresh) { if (chosen.length >= rounds) break; add(q.id); }
  // Everything has been played: let the oldest ones return.
  for (const q of shuffle(bank)) { if (chosen.length >= rounds) break; add(q.id); }
  for (let tries = 0; chosen.length < rounds && tries < 400; tries++) add(randomGenerated(kind));
  return shuffle(chosen).slice(0, rounds);
}

export function drawCard(deck: DeckKind, avoid: Set<number>): number {
  const n = DECKS[deck].cards.length;
  const choices = Array.from({ length: n }, (_, i) => i).filter((i) => !avoid.has(i));
  const pool = choices.length ? choices : Array.from({ length: n }, (_, i) => i);
  return pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length];
}

export function matchLine(score: number, total: number, kind: GameKind, subject: string, guesser?: string): string {
  const pct = total ? score / total : 0;
  if (kind === "know" && guesser) {
    // Seen by the person the quiz is about.
    return pct === 1 ? `${guesser} knows you by heart.` :
      pct >= 0.75 ? `${guesser} really knows you.` :
      pct >= 0.5 ? "Pretty good. A few surprises left to discover." :
      `${guesser} has lots more to learn about you. That's the fun part.`;
  }
  if (kind === "know") {
    return pct === 1 ? `Perfect. You know ${subject} by heart.` :
      pct >= 0.75 ? `You really know ${subject}.` :
      pct >= 0.5 ? `Pretty good. A few surprises left to discover.` :
      `So much more to learn about ${subject}. That's the fun part.`;
  }
  return pct >= 0.9 ? "Basically one heart in two people." :
    pct >= 0.7 ? "So in sync." :
    pct >= 0.4 ? "Lovely differences, plenty in common." :
    "Opposites attract. Talk about the ones you didn't match.";
}
