import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { filterLibrary, loadLibrary, withEntry, type LibraryEntry } from '../library/library';
import { detectServiceType } from '../services/detect';
import { importFile, importGeoPdfUrl } from '../services/importFile';
import { readService } from '../services/read';
import { SERVICE_TYPES, type Offer, type ServiceInfo, type ServiceType } from '../services/types';
import { hostOf, isProxied } from '../state/net';
import { addLayer, setHostProxied, state } from '../state/store';
import { errorMessage } from '../state/ui';
import { CloseIcon } from './icons';

type Tab = 'library' | 'address' | 'file';

/** Most offers listed at once; services like NASA GIBS have over a thousand layers. */
const MAX_LISTED = 300;

interface Failure {
  message: string;
  /** The address that failed, for retrying it through the proxy. */
  retry?: () => void;
  host?: string;
}

export function AddLayerDialog(props: { open: boolean; onClose: () => void }) {
  let dialog!: HTMLDialogElement;
  const [tab, setTab] = createSignal<Tab>('library');
  const [service, setService] = createSignal<ServiceInfo>();
  const [busy, setBusy] = createSignal<string>();
  const [failure, setFailure] = createSignal<Failure>();

  createEffect(() => {
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  });

  const reset = () => {
    setService(undefined);
    setFailure(undefined);
    setBusy(undefined);
  };

  /** Reads a service; one with a single layer is added at once, others are listed. */
  async function open(type: ServiceType, url: string, entry?: LibraryEntry) {
    const retry = () => void open(type, url, entry);
    setFailure(undefined);
    setBusy(`Reading ${hostOf(url) ?? url}…`);
    try {
      if (type === 'geopdf') {
        addLayer(await importGeoPdfUrl(url));
        props.onClose();
        return;
      }
      let info = await readService(type, url);
      if (entry) info = withEntry(info, entry);
      const only = info.offers.length === 1 ? info.offers[0]!.draft : undefined;
      if (only) {
        addLayer(only);
        props.onClose();
      } else {
        setService(info);
      }
    } catch (error) {
      setFailure({ message: errorMessage(error), retry, ...(hostOf(url) && { host: hostOf(url) }) });
    } finally {
      setBusy(undefined);
    }
  }

  async function importFiles(files: File[]) {
    setFailure(undefined);
    const problems: string[] = [];
    for (const file of files) {
      setBusy(`Reading ${file.name}…`);
      try {
        addLayer(await importFile(file, file.name));
      } catch (error) {
        problems.push(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setBusy(undefined);
    if (problems.length > 0) setFailure({ message: problems.join('\n') });
    else props.onClose();
  }

  return (
    <dialog
      ref={dialog}
      class="dialog add-layer"
      onClose={() => {
        reset();
        props.onClose();
      }}
    >
      <div class="row dialog-title">
        <h2 class="grow">Add layer</h2>
        <button class="icon" aria-label="Close" onClick={() => props.onClose()}>
          <CloseIcon />
        </button>
      </div>
      <Show
        when={service()}
        fallback={
          <>
            <div class="tabs" role="tablist">
              <For each={[['library', 'Library'], ['address', 'Address'], ['file', 'File']] as const}>
                {([value, label]) => (
                  <button role="tab" aria-selected={tab() === value} classList={{ selected: tab() === value }} onClick={() => setTab(value)}>
                    {label}
                  </button>
                )}
              </For>
            </div>
            <Show when={tab() === 'library'}>
              <LibraryTab onOpen={(entry) => void open(entry.type, entry.url, entry)} />
            </Show>
            <Show when={tab() === 'address'}>
              <AddressTab onOpen={(type, url) => void open(type, url)} />
            </Show>
            <Show when={tab() === 'file'}>
              <FileTab onFiles={(files) => void importFiles(files)} />
            </Show>
          </>
        }
      >
        {(info) => <ServiceView info={info()} onBack={() => setService(undefined)} />}
      </Show>
      <Show when={busy()}>{(text) => <p class="note info">{text()}</p>}</Show>
      <Show when={failure()}>{(f) => <FailureNote failure={f()} />}</Show>
    </dialog>
  );
}

/** What went wrong, with the way out where there is one: the CORS proxy for that host. */
function FailureNote(props: { failure: Failure }) {
  const host = () => props.failure.host;
  const canProxy = () => {
    const h = host();
    return h !== undefined && state.settings.proxy !== '' && !isProxied(`https://${h}/`);
  };
  return (
    <div class="note error">
      <p class="pre">{props.failure.message}</p>
      <Show when={canProxy()}>
        <button
          onClick={() => {
            setHostProxied(host()!, true);
            props.failure.retry?.();
          }}
        >
          Fetch {host()} through the CORS proxy
        </button>
      </Show>
      <Show when={host() && !state.settings.proxy}>
        <p class="muted">A CORS proxy can be set in Settings.</p>
      </Show>
    </div>
  );
}

function LibraryTab(props: { onOpen: (entry: LibraryEntry) => void }) {
  const [library] = createResource(loadLibrary);
  const [query, setQuery] = createSignal('');
  const [region, setRegion] = createSignal('');
  const [category, setCategory] = createSignal('');
  const distinct = (key: 'region' | 'category') => [...new Set((library() ?? []).map((e) => e[key]))];
  const entries = createMemo(() => filterLibrary(library() ?? [], query(), region(), category()));

  return (
    <div class="library">
      <div class="row filters">
        <input class="grow" type="search" placeholder="Search" aria-label="Search the library" onInput={(e) => setQuery(e.currentTarget.value)} />
        <select aria-label="Region" onChange={(e) => setRegion(e.currentTarget.value)}>
          <option value="">All regions</option>
          <For each={distinct('region')}>{(r) => <option>{r}</option>}</For>
        </select>
        <select aria-label="Category" onChange={(e) => setCategory(e.currentTarget.value)}>
          <option value="">All categories</option>
          <For each={distinct('category').sort()}>{(c) => <option>{c}</option>}</For>
        </select>
      </div>
      <ul class="entries">
        <For each={entries()} fallback={<li class="muted">{library.loading ? 'Loading…' : 'Nothing matches.'}</li>}>
          {(entry) => (
            <li>
              <button class="entry" onClick={() => props.onOpen(entry)}>
                <span class="row">
                  <strong class="grow">{entry.name}</strong>
                  <Show when={entry.cors === false}>
                    <span class="badge" title="The server sends no CORS headers; it needs a CORS proxy">
                      proxy
                    </span>
                  </Show>
                </span>
                <span class="muted">
                  {entry.region} · {entry.category} · {SERVICE_TYPES.find((t) => t.value === entry.type)?.label}
                </span>
                <Show when={entry.note}>
                  <span class="note-text">{entry.note}</span>
                </Show>
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

function AddressTab(props: { onOpen: (type: ServiceType, url: string) => void }) {
  const [url, setUrl] = createSignal('');
  const [chosen, setChosen] = createSignal<ServiceType | ''>('');
  const detected = () => detectServiceType(url());
  const type = () => chosen() || detected();

  return (
    <form
      class="address"
      onSubmit={(e) => {
        e.preventDefault();
        const t = type();
        if (t && url().trim()) props.onOpen(t, url().trim());
      }}
    >
      <p class="muted hint">
        A WMS or WMTS capabilities address, an ArcGIS MapServer or FeatureServer, a tile template with {'{z}/{x}/{y}'},
        a GeoJSON file, a MapLibre style or a GeoPDF.
      </p>
      <input type="url" required placeholder="https://…" aria-label="Address" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
      <div class="row">
        <select aria-label="Kind of service" value={chosen()} onChange={(e) => setChosen(e.currentTarget.value as ServiceType | '')}>
          <option value="">{detected() ? `Detected: ${SERVICE_TYPES.find((t) => t.value === detected())?.label}` : 'Kind of service…'}</option>
          <For each={SERVICE_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
        </select>
        <span class="grow" />
        <button class="primary" type="submit" disabled={!type() || !url().trim()}>
          Open
        </button>
      </div>
    </form>
  );
}

function FileTab(props: { onFiles: (files: File[]) => void }) {
  return (
    <div class="file">
      <p class="muted hint">
        GeoJSON files and GeoPDFs. They are kept in this browser; a GeoPDF is kept as a picture of its map area.
      </p>
      <label class="button">
        Choose files
        <input
          type="file"
          hidden
          multiple
          accept=".geojson,.json,.pdf,application/geo+json,application/json,application/pdf"
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = '';
            if (files.length > 0) props.onFiles(files);
          }}
        />
      </label>
    </div>
  );
}

/** The layers a service offers, each to be added; layers it cannot show say why. */
function ServiceView(props: { info: ServiceInfo; onBack: () => void }) {
  const [query, setQuery] = createSignal('');
  const [added, setAdded] = createSignal(new Set<Offer>());
  const matches = createMemo(() => {
    const words = query().toLowerCase().split(/\s+/).filter(Boolean);
    return props.info.offers.filter((o) => words.every((w) => `${o.title} ${o.name ?? ''}`.toLowerCase().includes(w)));
  });

  return (
    <div class="service">
      <div class="row">
        <button onClick={() => props.onBack()}>Back</button>
        <strong class="grow name">{props.info.title}</strong>
      </div>
      <Show when={props.info.description}>
        <details>
          <summary class="muted">About this service</summary>
          <p class="pre">{props.info.description}</p>
        </details>
      </Show>
      <Show when={props.info.offers.length > 15}>
        <input type="search" placeholder={`Filter ${props.info.offers.length} layers`} aria-label="Filter layers" onInput={(e) => setQuery(e.currentTarget.value)} />
      </Show>
      <ul class="offers">
        <For each={matches().slice(0, MAX_LISTED)}>
          {(offer) => (
            <li class="offer" classList={{ heading: !offer.draft && !offer.reason }} style={{ 'padding-left': `${offer.depth * 14}px` }}>
              <span class="grow">
                <span class="name" title={offer.description}>
                  {offer.title}
                </span>
                <Show when={offer.name && offer.name !== offer.title}>
                  <span class="muted id"> {offer.name}</span>
                </Show>
                <Show when={offer.reason}>
                  <span class="muted reason">{offer.reason}</span>
                </Show>
              </span>
              <Show when={offer.draft}>
                {(draft) => (
                  <Show when={!added().has(offer)} fallback={<span class="muted">Added</span>}>
                    <button
                      onClick={() => {
                        addLayer(draft());
                        setAdded(new Set([...added(), offer]));
                      }}
                    >
                      Add
                    </button>
                  </Show>
                )}
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={matches().length > MAX_LISTED}>
        <p class="muted hint">
          {matches().length - MAX_LISTED} more; narrow the filter to see them.
        </p>
      </Show>
    </div>
  );
}
