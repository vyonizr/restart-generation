// The page's entry (ADR 0013): the Svelte app draws the page, then the old script that runs the game starts.
import './styles.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.body });
await import('../main.js');
