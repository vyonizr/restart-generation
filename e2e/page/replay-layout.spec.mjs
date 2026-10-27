// The replay page's title band, lower third and control strip (CONTEXT.md "Control strip") hold their controls at every size the
// page lays out differently. On a wide window the view, and so each row, is as wide as the window's height allows (replay.css
// --screen-h); on a narrow one its width decides, with breakpoints at 459 and 759 wide and at a strip of 640.
import { test, expect, seed } from '../fixtures.mjs';

const SIZES = [
  // 1280 wide: a short window gives a 289px strip, a full HD one 711px
  [1280, 600], [1280, 720], [1280, 800], [1280, 1080],
  // 720 high: each side of the window-width breakpoints
  [360, 720], [459, 720], [460, 720], [759, 720], [760, 720],
];
// A slider narrower than this leaves the pointer too little track to set it.
const SLIDER_MIN_PX = 48;

for (const kept of [seed.replays.find(r => !r.marks), seed.replays.find(r => r.marks)]) {
  test(`every row holds its controls at every size, ${kept.marks ? 'with' : 'without'} marks`, async ({ page, isMobile }) => {
    await page.goto(`/replay/${kept.id}`);
    const strip = page.getByRole('group', { name: 'Replay controls' });
    const rows = [page.locator('.title-band'), page.getByRole('list', { name: 'Players by seat' }), strip];
    await expect(strip.getByRole('button', { name: 'Next moment' })).toHaveCount(kept.marks ? 1 : 0);
    // A touch device keeps its own size, and sets the volume with its own buttons (DESIGN.md).
    for (const [width, height] of isMobile ? [[page.viewportSize().width, page.viewportSize().height]] : SIZES) {
      await test.step(`${width}×${height}`, async () => {
        await page.setViewportSize({ width, height });
        for (const row of rows) await expect.soft(row).toFitItsControls();
        const sliders = [strip.getByRole('slider', { name: 'Time' }), ...isMobile ? [] : [strip.getByRole('slider', { name: 'Volume' })]];
        for (const slider of sliders) expect.soft((await slider.boundingBox()).width, `${await slider.getAttribute('aria-label')} slider width`).toBeGreaterThanOrEqual(SLIDER_MIN_PX);
      });
    }
  });
}
