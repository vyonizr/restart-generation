<!-- Discord's symbol before the words of a button that starts Discord sign-in (docs/adr/0042): Discord's own White and Black files,
     unchanged, as tall as the label's capitals and on its baseline. It is white, and black where the button turns white, the only two
     colors Discord allows on a restyled button. Screen readers skip it: the words name the button. -->
<script>
  import white from '../../assets/discord-symbol-white.svg';
  import black from '../../assets/discord-symbol-black.svg';
</script>

<span class="discord-symbol" aria-hidden="true"><img class="on-dark" src={white} alt=""><img class="on-light" src={black} alt=""></span>
