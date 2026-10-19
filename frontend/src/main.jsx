import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './dialogs.css';
import './mockup.css';
import './workspace/workspace.css';
import './plant-model.css';
import './shopping-lists.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
createRoot(root).render(<App />);

import './product-wizard.css';
