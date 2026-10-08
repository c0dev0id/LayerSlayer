import { iconSize, MAX_ICON_SIZE, MIN_ICON_SIZE } from '../model/icon';

/**
 * How many times their normal size icons are drawn, 1 to 3 in quarter steps, and the size
 * that gives: a layer's icons, a route's waypoints. `onChange` comes when the slider is let go.
 */
export function IconSizeSlider(props: { label: string; value: number | undefined; onInput: (size: number) => void; onChange?: () => void }) {
  return (
    <>
      <input
        class="grow"
        type="range"
        aria-label={props.label}
        min={MIN_ICON_SIZE}
        max={MAX_ICON_SIZE}
        step="0.25"
        value={iconSize(props.value)}
        onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
        onChange={() => props.onChange?.()}
      />
      <span class="value">{iconSize(props.value)}×</span>
    </>
  );
}
