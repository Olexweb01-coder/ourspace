// Bets are encrypted like messages, bound to the space, the game and whose bet it is.
export const betAad = (spaceId: string, gameId: string, memberId: string) => `bet:${spaceId}:${gameId}:${memberId}`;
export const BET_IDEAS = [
  "50 kisses", "100 kisses", "A long, long hug", "Breakfast in bed", "A handwritten love letter", "A voice note singing to me",
  "A 10-minute call telling me why you love me", "I pick our next date", "A foot massage", "My favourite meal, cooked by you",
  "A slow dance, our song", "A sweet surprise this week", "My choice of movie night",
];
