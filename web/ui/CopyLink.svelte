<!-- Copies the replay page's own address, for sharing, and says whether it worked. -->
<script>
  import { copyLinkFeedback } from './clipboard.js';

  let label = $state('Copy link');
  const copy = copyLinkFeedback(text => { label = text; });
</script>

<button type="button" class="secondary copy-link" onclick={() => copy(location.href.split(/[?#]/)[0])}><span aria-live="polite">{label}</span></button>
