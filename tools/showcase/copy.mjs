// The showcase's words (docs/adr/0036): one headline and one post caption for each feature it shows, and the two lines every post
// ends with. Facts from README.md and PRODUCT.md only: no testimonials, no press, no player counts (PRODUCT.md). Edit here and run
// `npm run showcase -- --cards` to draw the cards and the preview again without filming anything.
//
// Kept short, as revival projects word their pitches and as the platforms show text: a headline of at most 5 words and 30
// characters (Apple's subtitle and Google Play's title limits, under Meta's 40-character headline), in sentence case because the
// card's font sets it in capitals and X advises against all-caps posts; a caption of at most 100 characters, one idea, speaking to
// the player (X: "the best performing ads are only 50-100 characters"; Meta: 125 characters of primary text in the Instagram feed).
// A whole post (caption, needs, disclaimer, one link) stays within X's 280.

export const SITE = 'Restart Generation';
// The page footer's own words (PRODUCT.md), the last line of every card and post.
export const DISCLAIMER = 'Unofficial fan revival project. Not affiliated with RedLynx, Ubisoft or Nokia.';
// After every caption, plainly, as ScummVM and OpenMW say it: no post promises the game itself.
export const NEEDS = 'Bring your own copy of Windows standalone build.';

export const FEATURES = {
  browser: {
    headline: 'Play it in your browser',
    caption: 'Play Reset Generation (2008) in your browser on Windows, Linux, Android, macOS or iOS',
  },
  battle: {
    headline: 'Four players. One board.',
    caption: 'Ranked battles for up to four players',
  },
  board: {
    headline: 'See the whole battlefield',
    caption: 'Now supports full board view',
  },
  quickmatch: {
    headline: 'Ranked Quick Match',
    caption: 'Join a ranked Quick Matches for two to four players on a community-run server.',
  },
  rankings: {
    headline: 'Win fame. Climb the ranks.',
    caption: 'Ranked wins earn fame and fame levels',
  },
  rooms: {
    headline: 'Supports fill-in bots',
    caption: 'Make a room for friends and fill the empty seats with bots',
  },
  replay: {
    headline: 'Supports Replays',
    caption: 'Watch and learn how the opponent moves and learn from your mistakes',
  },
  footage: {
    headline: 'Save replays',
    caption: 'Download and keep the recording of your intense matches',
  },
  replays: {
    headline: 'Your last 25 battles',
    caption: 'Your last 25 replays sit under your name, with the hero you played and whether you won.',
  },
  phone: {
    headline: 'Play on your phone',
    caption: 'On a phone or tablet, a touch pad sits under the game: D-pad, Select and Back.',
  },
};
