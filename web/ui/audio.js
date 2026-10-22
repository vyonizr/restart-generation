// Audio: the engine fills 512-sample blocks of 8 kHz mono PCM on demand.
export const soundContext = () => new AudioContext({ sampleRate: 8000 });

export class Audio {
  // ctx: a context the page already started (the first gamepad starts one before Start, gamepad.js), or a new one.
  constructor(game, ctx = null) {
    this.game = game;
    this.ctx = ctx ?? soundContext();
    this.at = 0;
  }
  pump() {
    const ctx = this.ctx;
    if (this.at < ctx.currentTime) this.at = ctx.currentTime + 0.05;
    while (this.at < ctx.currentTime + 0.25) {
      const pcm = this.game.pullSound(), buf = ctx.createBuffer(1, pcm.length, 8000), ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(this.at);
      this.at += pcm.length / 8000;
    }
  }
}

// A replay's sound. The engine's battle moves on only while its sound is drained (docs/re/re_replay.md), so this pulls a block for
// every 64 ms of engine time whether or not the browser can play it yet, and plays what it pulls while the context runs, through
// a volume the replay page sets (0 is muted).
export class ReplaySound {
  constructor(game) {
    this.game = game;
    this.ctx = soundContext();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
    this.pulled = 0;
    this.at = 0;
  }
  set volume(v) { this.gain.gain.value = v; }
  pump() {
    const ctx = this.ctx;
    while (this.pulled * 64 < this.game.time) {
      const pcm = this.game.pullSound();
      this.pulled++;
      if (ctx.state !== 'running') continue;
      if (this.at < ctx.currentTime) this.at = ctx.currentTime + 0.05;
      const buf = ctx.createBuffer(1, pcm.length, 8000), ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(this.gain); src.start(this.at);
      this.at += pcm.length / 8000;
    }
  }
}
