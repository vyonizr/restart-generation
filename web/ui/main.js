// The page's entry (ADR 0013): the Svelte app draws the page and starts the game.
import './styles.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.body });

// The running engine can't be hot-swapped: a remounted App would start a second one beside the first. Styles still swap in place;
// a changed script or component reloads the page.
if (import.meta.hot) import.meta.hot.on('vite:beforeUpdate', ({ updates }) => { if (updates.some(u => !u.path.endsWith('.css'))) location.reload(); });
