<!-- Shares the replay page's own address: a phone or tablet opens its share sheet; elsewhere the address is copied and the button
     says whether that worked. -->
<script>
  import { copyLinkFeedback } from '../clipboard.js';
  import { touch } from '../device.js';

  let label = $state('Share');
  const copy = copyLinkFeedback(text => { label = text; }, 'Share');
  function share() {
    const url = location.href.split(/[?#]/)[0];
    if (touch && navigator.share) navigator.share({ url }).catch(() => {}); // closing the sheet rejects
    else copy(url);
  }
</script>

<button type="button" class="secondary share" onclick={share}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14.5V3.5M8 7.5l4-4 4 4M9 10H5.5v10.5h13V10H15"/></svg>
  <span class="label" aria-live="polite">{label}</span>
</button>
