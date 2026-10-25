// The replay page's entry (web/replay/index.html).
import './styles/replay.css';
import { mount } from 'svelte';
import Replay from './lib/replay/Replay.svelte';

mount(Replay, { target: document.body });
