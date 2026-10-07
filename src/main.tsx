import { render } from 'solid-js/web';
import { App } from './App';
import { collectFiles } from './state/files';
import { state } from './state/store';
import { storedFile } from './model/layer';
import './styles.css';

render(() => <App />, document.getElementById('root')!);

// Files of layers removed in a session that ended before the deletion finished.
void collectFiles(new Set(state.layers.map((l) => storedFile(l.source)).filter((f): f is string => f !== undefined)));
