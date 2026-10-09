import { createMemo, createResource, createRoot, createSignal, For, Index, Match, Show, Switch } from 'solid-js';
import { allOutside } from '../geo/bounds';
import {
  downloadedLayer,
  entryAreas,
  entryService,
  entryTypeLabel,
  filterLibrary,
  loadLibrary,
  withEntry,
  type FileEntry,
  type LibraryEntry,
  type ServiceEntry,
} from '../library/library';
import { dataLabel, entryFacts } from '../library/entryInfo';
import type { Bounds } from '../model/layer';
import { decodePlaceholders, hasPlaceholders, parsePmtilesUrl } from '../map/urls';
import { detectServiceType } from '../services/detect';
import { IMPORT_ACCEPT, importFile, importGeoPdfUrl } from '../services/importFile';
import { readService } from '../services/read';
import { htmlText } from '../services/xml';
import { SERVICE_TYPES, type Offer, type ServiceInfo, type ServiceType } from '../services/types';
import { hostOf, isProxied } from '../state/net';
import { addLayer, focusBounds, removeLayersWhere, setHostProxied, state } from '../state/store';
import { errorMessage } from '../state/ui';
import { askConfirmation } from './confirm';
import { CloseIcon, DownloadLink, InfoIcon } from './icons';
import { showModalWhile } from './modal';
import { OsmQueryTab } from './OsmQueryTab';
import { groupMembers, isFromSource, originOf, selection, type Selection } from './offers';

type Tab = 'library' | 'address' | 'file' | 'osm';

/** Most offers listed at once; services like NASA GIBS have over a thousand layers. */
const MAX_LISTED = 300;

/** Adding more layers than this at once asks first: each is fetched and drawn on its own. */
const CONFIRM_ABOVE = 20;

/** A source to read: from the library, or an address typed in. */
interface Source {
  type: ServiceEntry['type'];
  url: string;
  entry?: ServiceEntry;
}

interface Failure {
  message: string;
  /** What to read again, through the proxy. */
  source?: Source;
}

/** What each source offers, read once per session; a failed read is tried again next time. */
const reads = new Map<string, Promise<ServiceInfo>>();

function read(source: Source): Promise<ServiceInfo> {
  const key = `${source.type} ${source.url}`;
  let info = reads.get(key);
  if (!info) {
    const known = source.entry && entryService(source.entry);
    info = (known ? Promise.resolve(known) : readService(source.type, source.url, state.view.center)).then((i) =>
      source.entry ? withEntry(i, source.entry) : i,
    );
    info.catch(() => reads.delete(key));
    reads.set(key, info);
  }
  return info;
}

/** The origins of the layers on the map, for marking what the lists offer as added. */
const origins = createRoot(() =>
  createMemo(() => new Set(state.layers.map((l) => l.origin).filter((o): o is string => o !== undefined))),
);

function isAdded(url: string, offer: Offer): boolean {
  return origins().has(originOf(url, offer));
}

/** Whether a focus area is set and `areas` are known to lie outside its bounds. */
function outsideFocus(areas: readonly Bounds[]): boolean {
  const focus = focusBounds();
  return focus !== undefined && allOutside(areas, focus);
}

const offerAreas = (offer: Offer): Bounds[] => (offer.draft?.bounds ? [offer.draft.bounds] : []);

/** Adds the offer's layer, or removes it when it is on the map already. */
function toggle(url: string, offer: Offer): void {
  const origin = originOf(url, offer);
  if (origins().has(origin)) removeLayersWhere((l) => l.origin === origin);
  else if (offer.draft) addLayer({ ...offer.draft, origin });
}

/** Adds what of a group is not on the map yet, or removes the group when all of it is. */
async function toggleGroup(url: string, members: readonly Offer[]): Promise<void> {
  if (selection(members, (o) => isAdded(url, o)) === 'all') {
    const remove = new Set(members.map((o) => originOf(url, o)));
    removeLayersWhere((l) => l.origin !== undefined && remove.has(l.origin));
    return;
  }
  const missing = members.filter((o) => !isAdded(url, o));
  const message = `Add ${missing.length} layers? Each is fetched and drawn on its own.`;
  if (missing.length > CONFIRM_ABOVE && !(await askConfirmation(message, 'Add layers'))) return;
  for (const offer of missing) addLayer({ ...offer.draft!, origin: originOf(url, offer) });
}

/**
 * Adds layers without leaving: the source list (library, address, files, OSM query) and a source's
 * layer list take turns, and a tap adds or removes a layer in the background. The source
 * list stays mounted while a layer list is open, so its search and scroll survive.
 */
export function AddLayerDialog(props: { open: boolean; onClose: () => void }) {
  let dialog!: HTMLDialogElement;
  const [tab, setTab] = createSignal<Tab>('library');
  const [opened, setOpened] = createSignal<{ source: Source; info: ServiceInfo }>();
  const [busy, setBusy] = createSignal<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = createSignal<Failure>();
  /** How many layers a source offers, once it has been read. */
  const [sizes, setSizes] = createSignal<ReadonlyMap<string, number>>(new Map());

  showModalWhile(() => dialog, () => props.open);

  const setReading = (url: string, reading: boolean) => {
    const next = new Set(busy());
    if (reading) next.add(url);
    else next.delete(url);
    setBusy(next);
  };

  /**
   * Reads a source and shows its layers. A library entry with a single layer is that
   * layer: a tap adds or removes it in place, without a list of one.
   */
  async function open(source: Source) {
    setFailure(undefined);
    // The library knows which servers need the proxy; with one set, they use it from the start.
    const host = hostOf(source.url);
    if (source.entry?.cors === false && state.settings.proxy && host && !isProxied(source.url)) setHostProxied(host, true);
    setReading(source.url, true);
    try {
      const info = await read(source);
      setSizes(new Map(sizes()).set(source.url, info.offers.filter((o) => o.draft).length));
      const only = info.offers.length === 1 && info.offers[0]!.draft ? info.offers[0]! : undefined;
      if (only && source.entry) toggle(source.url, only);
      else setOpened({ source, info });
    } catch (error) {
      setFailure({ message: `${source.entry?.name ?? hostOf(source.url) ?? source.url}: ${errorMessage(error)}`, source });
    } finally {
      setReading(source.url, false);
    }
  }

  /** Opens the file of a library entry that the user downloaded. */
  async function openDownloaded(entry: FileEntry, file: File) {
    setFailure(undefined);
    setReading(entry.url, true);
    try {
      addLayer(downloadedLayer(await importFile(file, file.name), entry));
    } catch (error) {
      setFailure({ message: `${entry.name}: ${errorMessage(error)}` });
    } finally {
      setReading(entry.url, false);
    }
  }

  return (
    <dialog
      ref={dialog}
      class="dialog add-layer"
      onClose={() => {
        setOpened(undefined);
        setFailure(undefined);
        props.onClose();
      }}
    >
      <div class="row dialog-title">
        <h2 class="grow">Add layers</h2>
        <button class="primary" onClick={() => props.onClose()}>
          Close
        </button>
      </div>
      <Show when={failure()}>{(f) => <FailureNote failure={f()} onRetry={(s) => void open(s)} onDismiss={() => setFailure(undefined)} />}</Show>
      <div class="pane" hidden={opened() !== undefined}>
        <div class="tabs" role="tablist">
          <For each={[['library', 'Library'], ['address', 'Address'], ['file', 'Files'], ['osm', 'OSM Query']] as const}>
            {([value, label]) => (
              <button role="tab" aria-selected={tab() === value} classList={{ selected: tab() === value }} onClick={() => setTab(value)}>
                {label}
              </button>
            )}
          </For>
        </div>
        <div class="tab-panel" role="tabpanel" hidden={tab() !== 'library'}>
          <LibraryTab
            busy={busy()}
            sizes={sizes()}
            onOpen={(entry) => void open({ type: entry.type, url: entry.url, entry })}
            onFile={(entry, file) => void openDownloaded(entry, file)}
          />
        </div>
        <div class="tab-panel" role="tabpanel" hidden={tab() !== 'address'}>
          <AddressTab busy={busy()} onOpen={(source) => void open(source)} onFailure={setFailure} />
        </div>
        <div class="tab-panel" role="tabpanel" hidden={tab() !== 'file'}>
          <FileTab />
        </div>
        <div class="tab-panel" role="tabpanel" hidden={tab() !== 'osm'}>
          <OsmQueryTab active={props.open && tab() === 'osm'} onClose={() => props.onClose()} />
        </div>
      </div>
      <Show when={opened()} keyed>
        {(o) => <ServiceView url={o.source.url} info={o.info} onBack={() => setOpened(undefined)} />}
      </Show>
    </dialog>
  );
}

/** What went wrong, with the way out where there is one: the CORS proxy for that host. */
function FailureNote(props: { failure: Failure; onRetry: (source: Source) => void; onDismiss: () => void }) {
  const host = () => (props.failure.source ? hostOf(props.failure.source.url) : undefined);
  const canProxy = () => {
    const h = host();
    return h !== undefined && state.settings.proxy !== '' && !isProxied(`https://${h}/`);
  };
  return (
    <div class="note error">
      <div class="row">
        <p class="pre grow">{props.failure.message}</p>
        <button class="icon" aria-label="Dismiss" onClick={() => props.onDismiss()}>
          <CloseIcon />
        </button>
      </div>
      <Show when={canProxy()}>
        <button
          onClick={() => {
            setHostProxied(host()!, true);
            props.onRetry(props.failure.source!);
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

/**
 * The library's entries, searched and filtered. A service entry opens the service; a file
 * entry, whose server does not let the page read it, has a link that downloads the file
 * and asks for the downloaded file when tapped. Each entry's info button shows its
 * technical details under it.
 */
function LibraryTab(props: {
  busy: ReadonlySet<string>;
  sizes: ReadonlyMap<string, number>;
  onOpen: (entry: ServiceEntry) => void;
  onFile: (entry: FileEntry, file: File) => void;
}) {
  const [library] = createResource(loadLibrary);
  let chooser!: HTMLInputElement;
  /** The file entry whose file is being chosen. */
  let choosing: FileEntry | undefined;
  /** A tap on an entry: a service opens; a file is asked for, or removed when it is on the map. */
  const tap = (entry: LibraryEntry, onMap: boolean) => {
    if (entry.type !== 'file') return props.onOpen(entry);
    if (onMap) return removeLayersWhere((l) => l.origin === entry.url);
    choosing = entry;
    chooser.click();
  };
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
      <input
        ref={chooser}
        type="file"
        hidden
        accept={IMPORT_ACCEPT}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file && choosing) props.onFile(choosing, file);
        }}
      />
      <ul class="entries">
        <For each={entries()} fallback={<li class="muted">{library.loading ? 'Loading…' : 'Nothing matches.'}</li>}>
          {(entry) => {
            const onMap = () => state.layers.filter((l) => isFromSource(l.origin, entry.url)).length;
            const size = () => props.sizes.get(entry.url);
            const areas = entryAreas(entry);
            const outside = () => outsideFocus(areas);
            const [info, setInfo] = createSignal(false);
            return (
              <li>
                <div class="entry-line">
                  <button class="entry" classList={{ added: onMap() > 0, outside: outside() }} onClick={() => tap(entry, onMap() > 0)}>
                    <span class="row">
                      <strong class="grow">{entry.name}</strong>
                      <Show when={props.busy.has(entry.url)}>
                        <span class="muted">Reading…</span>
                      </Show>
                      <Show when={onMap() > 0}>
                        <span class="count">{onMap()} on the map</span>
                      </Show>
                      <Show when={entry.type !== 'file' && entry.cors === false}>
                        <span
                          class="badge"
                          title="The server does not allow web pages to read it (no valid CORS header). With a CORS proxy set in Settings, it goes through the proxy."
                        >
                          proxy
                        </span>
                      </Show>
                      <Show when={(size() ?? 0) > 1}>
                        <span class="muted">{size()} layers ›</span>
                      </Show>
                    </span>
                    <span class="muted">
                      {entry.region} · {entry.category} · {entryTypeLabel(entry)}
                      <Show when={outside()}> · outside the focus area</Show>
                    </span>
                    <Show when={entry.note}>
                      <span class="note-text">{entry.note}</span>
                    </Show>
                  </button>
                  <Show when={entry.type === 'file'}>
                    <DownloadLink class="entry-action" href={entry.url} of={entry.name} />
                  </Show>
                  <button
                    class="icon entry-action"
                    title="Technical details"
                    aria-label={`Technical details of ${entry.name}`}
                    aria-expanded={info()}
                    onClick={() => setInfo(!info())}
                  >
                    <InfoIcon />
                  </button>
                </div>
                <Show when={info()}>
                  <EntryInfo entry={entry} />
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}

/**
 * What an entry is, technically: what the library says at once, and what reading the
 * service adds (its kind of data, formats, version and layers). The read is the one that
 * opening the entry uses, so either finds it done.
 */
function EntryInfo(props: { entry: LibraryEntry }) {
  const entry = props.entry;
  const [facts] = createResource(() => entryFacts(entry, (service) => read({ type: service.type, url: service.url, entry: service })));
  const zooms =
    entry.type !== 'file' && (entry.minzoom !== undefined || entry.maxzoom !== undefined) ? `${entry.minzoom ?? 0}–${entry.maxzoom ?? '…'}` : undefined;
  return (
    <dl class="detail-rows entry-info">
      <dt>Address</dt>
      <dd>
        <Show when={!hasPlaceholders(entry.url)} fallback={entry.url}>
          <a href={entry.url} target="_blank" rel="noopener">
            {entry.url}
          </a>
        </Show>
      </dd>
      <dt>Service</dt>
      <dd>
        {entryTypeLabel(entry)}
        {facts.state === 'ready' && facts()?.version ? ` ${facts()!.version}` : ''}
      </dd>
      <Show when={entry.type !== 'file'}>
        <dt>Data</dt>
      </Show>
      <Switch>
        <Match when={facts.loading}>
          <dd class="muted">Reading the service…</dd>
        </Match>
        <Match when={facts.error as unknown}>{(error) => <dd class="muted">Could not be read: {errorMessage(error())}</dd>}</Match>
        <Match when={facts.state === 'ready' && facts()}>
          {(f) => (
            <>
              <dd>{dataLabel(f().data) || 'Unknown'}</dd>
              <dt>Format</dt>
              <dd>{f().formats.join('\n')}</dd>
              <Show when={f().layers > 1}>
                <dt>Layers</dt>
                <dd>{f().layers}</dd>
              </Show>
            </>
          )}
        </Match>
      </Switch>
      <Show when={zooms}>
        <dt>Tile zooms</dt>
        <dd>{zooms}</dd>
      </Show>
      <dt>Access</dt>
      <dd>
        {entry.type === 'file'
          ? 'Downloaded by a link: the server does not let web pages read the file'
          : entry.cors === false
            ? 'Through a CORS proxy: the server sends no valid CORS header'
            : 'Direct: the server lets web pages read it (CORS)'}
      </dd>
      <Show when={entry.attribution}>
        {(attribution) => (
          <>
            <dt>Attribution</dt>
            <dd>{htmlText(attribution())}</dd>
          </>
        )}
      </Show>
    </dl>
  );
}

function AddressTab(props: { busy: ReadonlySet<string>; onOpen: (source: Source) => void; onFailure: (failure: Failure) => void }) {
  const [url, setUrl] = createSignal('');
  const [chosen, setChosen] = createSignal<ServiceType | ''>('');
  const [added, setAdded] = createSignal<string>();
  /** The address as entered, with tile placeholders a browser copied percent-encoded (`%7Bz%7D`) in braces again. */
  const entered = () => decodePlaceholders(url().trim());
  const detected = () => detectServiceType(entered());
  /** The address read: a PMTiles archive copied with the scheme styles name it by, without it. */
  const address = () => parsePmtilesUrl(entered())?.archive ?? entered();
  const type = () => chosen() || detected();

  async function importPdf(address: string) {
    try {
      const draft = await importGeoPdfUrl(address);
      addLayer({ ...draft, origin: address });
      setAdded(draft.name);
    } catch (error) {
      props.onFailure({ message: `${address}: ${errorMessage(error)}` });
    }
  }

  return (
    <form
      class="address"
      onSubmit={(e) => {
        e.preventDefault();
        const t = type();
        if (!t || !address()) return;
        setAdded(undefined);
        if (t === 'geopdf') void importPdf(address());
        else props.onOpen({ type: t, url: address() });
      }}
    >
      <p class="muted hint">
        A WMS or WMTS capabilities address, an ArcGIS MapServer or FeatureServer, a tile template with {'{z}/{x}/{y}'},
        a PMTiles archive, a GeoJSON file, a MapLibre style or a GeoPDF.
      </p>
      <input type="url" required placeholder="https://…" aria-label="Address" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
      <div class="row">
        <select aria-label="Kind of service" value={chosen()} onChange={(e) => setChosen(e.currentTarget.value as ServiceType | '')}>
          <option value="">{detected() ? `Detected: ${SERVICE_TYPES.find((t) => t.value === detected())?.label}` : 'Kind of service…'}</option>
          <For each={SERVICE_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
        </select>
        <span class="grow" />
        <button class="primary" type="submit" disabled={!type() || !address() || props.busy.has(address())}>
          {props.busy.has(address()) ? 'Reading…' : 'Open'}
        </button>
      </div>
      <Show when={added()}>{(name) => <p class="note info">Added {name()}.</p>}</Show>
    </form>
  );
}

interface Imported {
  name: string;
  error?: string;
}

/** Files are added as they are chosen and listed; removing one is done in the layer list. */
function FileTab() {
  const [imported, setImported] = createSignal<Imported[]>([]);
  const [reading, setReading] = createSignal<string>();

  async function importFiles(files: File[]) {
    for (const file of files) {
      setReading(file.name);
      try {
        addLayer(await importFile(file, file.name));
        setImported([...imported(), { name: file.name }]);
      } catch (error) {
        setImported([...imported(), { name: file.name, error: errorMessage(error) }]);
      }
    }
    setReading(undefined);
  }

  return (
    <div class="file">
      <p class="muted hint">
        GeoJSON files, the tracks of GPX files, the placemarks of KML and KMZ files, and GeoPDFs. They are kept in this
        browser; a GeoPDF is kept as a picture of its map area.
      </p>
      <label class="button">
        Choose files
        <input
          type="file"
          hidden
          multiple
          accept={IMPORT_ACCEPT}
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = '';
            if (files.length > 0) void importFiles(files);
          }}
        />
      </label>
      <Show when={reading()}>{(name) => <p class="note info">Reading {name()}…</p>}</Show>
      <ul class="imported">
        <For each={imported()}>
          {(item) => (
            <li class="row" classList={{ added: !item.error }}>
              <span class="grow name">{item.name}</span>
              <span classList={{ muted: !item.error, error: !!item.error }}>{item.error ?? 'added'}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

/**
 * The layers a source offers. A tap on a layer adds or removes it; a tap on a group adds
 * what of it is missing, or removes it when all of it is on the map. Layers the source
 * cannot show say why.
 */
function ServiceView(props: { url: string; info: ServiceInfo; onBack: () => void }) {
  const [query, setQuery] = createSignal('');
  const indexed = props.info.offers.map((offer, index) => ({ offer, index }));
  const matches = createMemo(() => {
    const words = query().toLowerCase().split(/\s+/).filter(Boolean);
    return indexed.filter(({ offer: o }) => words.every((w) => `${o.title} ${o.name ?? ''}`.toLowerCase().includes(w)));
  });
  const onMap = () => state.layers.filter((l) => isFromSource(l.origin, props.url)).length;

  return (
    <div class="service">
      <div class="row">
        <button onClick={() => props.onBack()}>‹ Sources</button>
        <strong class="grow name">{props.info.title}</strong>
        <Show when={onMap() > 0}>
          <span class="count">{onMap()} on the map</span>
        </Show>
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
        <Index each={matches().slice(0, MAX_LISTED)}>
          {(item) => <OfferRow url={props.url} offers={props.info.offers} offer={item().offer} index={item().index} />}
        </Index>
      </ul>
      <Show when={matches().length > MAX_LISTED}>
        <p class="muted hint">{matches().length - MAX_LISTED} more; narrow the filter to see them.</p>
      </Show>
    </div>
  );
}

function OfferRow(props: { url: string; offers: readonly Offer[]; offer: Offer; index: number }) {
  const members = createMemo(() => (props.offer.draft ? [] : groupMembers(props.offers, props.index)));
  /** On the map: all, some or none of what the row stands for; undefined where nothing can be added. */
  const selected = (): Selection | undefined => {
    if (props.offer.draft) return isAdded(props.url, props.offer) ? 'all' : 'none';
    return members().length > 0 ? selection(members(), (o) => isAdded(props.url, o)) : undefined;
  };
  /** A layer, or a group whose layers all are, known to lie outside the focus area. */
  const outside = () =>
    props.offer.draft ? outsideFocus(offerAreas(props.offer)) : members().length > 0 && members().every((m) => outsideFocus(offerAreas(m)));
  return (
    <li>
      <button
        class="offer"
        classList={{ added: selected() === 'all', partial: selected() === 'some', heading: !props.offer.draft, outside: outside() }}
        style={{ 'padding-left': `${8 + props.offer.depth * 14}px` }}
        disabled={selected() === undefined}
        aria-pressed={selected() === 'some' ? 'mixed' : selected() === 'all'}
        onClick={() => (props.offer.draft ? toggle(props.url, props.offer) : void toggleGroup(props.url, members()))}
      >
        <span class="mark" aria-hidden="true" />
        <span class="grow">
          <span class="name" title={props.offer.description}>
            {props.offer.title}
          </span>
          <Show when={props.offer.name && props.offer.name !== props.offer.title}>
            <span class="muted id"> {props.offer.name}</span>
          </Show>
          <Show when={members().length > 0}>
            <span class="muted id"> · {members().length} layers</span>
          </Show>
          <Show when={outside()}>
            <span class="muted reason">Outside the focus area</span>
          </Show>
          <Show when={props.offer.reason}>
            <span class="muted reason">{props.offer.reason}</span>
          </Show>
        </span>
      </button>
    </li>
  );
}
