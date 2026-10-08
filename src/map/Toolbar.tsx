import type { JSX } from 'solid-js';
import { reach, setReach, setTool, tool, type Tool } from '../state/drawing';
import { redo, redoLabel, undo, undoLabel } from '../state/routes';
import { AppendIcon, DeleteIcon, InsertIcon, LineIcon, RedoIcon, RouteIcon, UndoIcon, WaypointIcon } from '../ui/icons';

/**
 * A toolbar button: an icon over a short caption, with a tooltip that says more. `active`
 * marks the picked tool.
 */
function ToolButton(props: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      class="tool"
      classList={{ active: props.active }}
      title={props.title}
      aria-pressed={props.active === undefined ? undefined : props.active}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      {props.children}
      <span class="tool-label">{props.label}</span>
    </button>
  );
}

/** The tools of the route being drawn over the map, with undo and redo of route edits. */
export function Toolbar() {
  const button = (t: Tool, label: string, title: string, icon: JSX.Element) => (
    <ToolButton label={label} title={title} active={tool() === t} onClick={() => setTool(t)}>
      {icon}
    </ToolButton>
  );
  return (
    <div class="toolbar" role="toolbar" aria-label="Route tools">
      <div class="toolbar-group" role="group" aria-label="Route">
        {button('append', 'Append', 'Tap the map to add points at the end of the route', <AppendIcon />)}
        {button('insert', 'Insert', 'Tap the route line to insert a point there', <InsertIcon />)}
        {button('waypoint', 'Waypoint', 'Tap the map to place a waypoint of this route, such as a viewpoint or a warning: exported and deleted with it', <WaypointIcon />)}
        {button('delete', 'Delete', 'Tap a route point or a waypoint to delete it', <DeleteIcon />)}
      </div>
      <div class="toolbar-group" role="group" aria-label="Reach new points by">
        <ToolButton
          label="Route"
          title="New points at the end are reached along the roads, by routing"
          active={reach() === 'route'}
          onClick={() => setReach('route')}
        >
          <RouteIcon />
        </ToolButton>
        <ToolButton
          label="Line"
          title="New points at the end are reached by a straight line: for a way the routing does not know"
          active={reach() === 'line'}
          onClick={() => setReach('line')}
        >
          <LineIcon />
        </ToolButton>
      </div>
      <div class="toolbar-group" role="group" aria-label="History">
        <ToolButton label="Undo" title={undoLabel() ? `Undo: ${undoLabel()} (Ctrl+Z)` : 'Nothing to undo'} disabled={!undoLabel()} onClick={undo}>
          <UndoIcon />
        </ToolButton>
        <ToolButton label="Redo" title={redoLabel() ? `Redo: ${redoLabel()} (Ctrl+Shift+Z)` : 'Nothing to redo'} disabled={!redoLabel()} onClick={redo}>
          <RedoIcon />
        </ToolButton>
      </div>
    </div>
  );
}
