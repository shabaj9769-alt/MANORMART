import React from 'react';
import { createRoot } from 'react-dom/client';
import CustomerApp from '../App.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<CustomerApp />);
}
