import { createSignal, Show } from 'solid-js';
import { openProject, readProject, saveProject } from '../state/project';
import { theme, toggleTheme } from '../state/theme';
import { errorMessage, panelCollapsed, setPanelCollapsed } from '../state/ui';
import { askConfirmation } from './confirm';
import { downloadBlob } from './download';
import { ChevronDownIcon, ChevronUpIcon, MoonIcon, SunIcon } from './icons';

async function open(file: File): Promise<void> {
  const project = await readProject(file);
  if (await askConfirmation(`Replace the layers, routes and focus area here with those of ${file.name}?`, 'Replace')) await openProject(project);
}

/**
 * The app's name, with the light/dark toggle (showing the theme it switches to), saving
 * everything to a .lslay file and opening one in its place; on narrow screens, where the
 * panel lies under the map, a button folds it to this header.
 */
export function ProjectSection() {
  const [error, setError] = createSignal<string>();
  return (
    <header class="section">
      <div class="row">
        <img class="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
        <h1 class="grow">Layer Slayer</h1>
        <button
          class="icon"
          title={theme() === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          aria-label={theme() === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={toggleTheme}
        >
          {theme() === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          title="Download the layers, routes, focus area and imported files as a .lslay file, to open in another browser or after clearing this one"
          onClick={async () => {
            setError(undefined);
            try {
              downloadBlob(await saveProject(), `layer-slayer-${new Date().toISOString().slice(0, 10)}.lslay`);
            } catch (e) {
              setError(`The project could not be saved: ${errorMessage(e)}`);
            }
          }}
        >
          Save
        </button>
        <label class="button" title="Open a .lslay (or older .webmap) file in place of the layers, routes and focus area here">
          Open
          <input
            type="file"
            hidden
            accept=".lslay,.webmap,application/zip"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              setError(undefined);
              try {
                await open(file);
              } catch (err) {
                setError(`${file.name} could not be opened: ${errorMessage(err)}`);
              }
            }}
          />
        </label>
        <button
          class="icon panel-toggle"
          title={panelCollapsed() ? 'Show the panel' : 'Fold the panel away, for more map'}
          aria-label={panelCollapsed() ? 'Show the panel' : 'Fold the panel away'}
          aria-expanded={!panelCollapsed()}
          onClick={() => setPanelCollapsed(!panelCollapsed())}
        >
          {panelCollapsed() ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>
      </div>
      <Show when={error()}>{(message) => <p class="note error">{message()}</p>}</Show>
    </header>
  );
}
