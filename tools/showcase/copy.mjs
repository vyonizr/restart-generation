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
export const DISCLAIMER = 'Unofficial fan revival. Not affiliated with RedLynx, Ubisoft or Nokia.';
// After every caption, plainly, as ScummVM and OpenMW say it: no post promises the game itself.
export const NEEDS = 'Bring your own copy: Windows standalone build.';

export const FEATURES = {
  browser: {
    headline: 'Play it in your browser',
    caption: 'Play Reset Generation (2008) in your browser on Windows, macOS, Linux, Android or iOS.',
  },
  battle: {
    headline: 'Four players. One board.',
    caption: 'Ranked battles for up to four players, with the whole battlefield on one screen.',
  },
  board: {
    headline: 'See the whole battlefield',
    caption: 'Full board shows the whole battlefield; Classic keeps the original 240 × 320. Switch mid-battle.',
  },
  quickmatch: {
    headline: 'Ranked Quick Match',
    caption: 'Pick a hero and join a ranked Quick Match for two to four players on a fan-run server.',
  },
  rankings: {
    headline: 'Win fame. Climb the ranks.',
    caption: 'Ranked wins earn fame and fame levels. The rankings show the top 10 and the players near you.',
  },
  rooms: {
    headline: 'Friendly rooms, CPU seats',
    caption: 'Make a room for friends and fill the empty seats with CPU or Expert players.',
  },
  replay: {
    headline: 'Rewatch every online battle',
    caption: 'Each online battle gets a replay page with its heroes, knockouts and marks to jump to.',
  },
  footage: {
    headline: 'Save any replay as MP4',
    caption: 'Download a replay as an MP4: the battle alone, or with its title band and players.',
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
