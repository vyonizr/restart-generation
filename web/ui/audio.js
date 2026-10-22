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
