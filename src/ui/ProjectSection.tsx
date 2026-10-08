import { createSignal, Show } from 'solid-js';
import { openProject, readProject, saveProject } from '../state/project';
import { errorMessage } from '../state/ui';
import { askConfirmation } from './confirm';
import { downloadBlob } from './download';

async function open(file: File): Promise<void> {
  const project = await readProject(file);
  if (await askConfirmation(`Replace the layers, routes and focus area here with those of ${file.name}?`, 'Replace')) await openProject(project);
}

/** The app's name, with saving everything to a .webmap file and opening one in its place. */
export function ProjectSection() {
  const [error, setError] = createSignal<string>();
  return (
    <header class="section">
      <div class="row">
        <h1 class="grow">Layer Slayer</h1>
        <button
          title="Download the layers, routes, focus area and imported files as a .webmap file, to open in another browser or after clearing this one"
          onClick={async () => {
            setError(undefined);
            try {
              downloadBlob(await saveProject(), `layer-slayer-${new Date().toISOString().slice(0, 10)}.webmap`);
            } catch (e) {
              setError(`The project could not be saved: ${errorMessage(e)}`);
            }
          }}
        >
          Save
        </button>
        <label class="button" title="Open a .webmap file in place of the layers, routes and focus area here">
          Open
          <input
            type="file"
            hidden
            accept=".webmap,application/zip"
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
      </div>
      <Show when={error()}>{(message) => <p class="note error">{message()}</p>}</Show>
    </header>
  );
}
