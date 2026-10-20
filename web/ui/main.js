// The page's entry (ADR 0013): the Svelte app draws the page and starts the game.
import './styles.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.body });
