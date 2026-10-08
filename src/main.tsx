import { render } from 'solid-js/web';
import { App } from './App';
import { sweepTileCache } from './map/tileCache';
import { storedFiles } from './model/layer';
import { collectFiles } from './state/files';
import { state } from './state/store';
import './styles.css';

render(() => <App />, document.getElementById('root')!);

// Files of layers removed in a session that ended before the deletion finished, and of
// queries whose layer was removed while they ran.
void collectFiles(storedFiles(state.layers));
void sweepTileCache().catch(() => {});
