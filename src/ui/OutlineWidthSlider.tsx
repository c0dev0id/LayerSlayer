import { MAX_OUTLINE_WIDTH } from '../model/label';

/**
 * The width of an outline in pixels, 0 to MAX_OUTLINE_WIDTH in half pixels: around a layer's
 * labels, along a route's line. `onChange` comes when the slider is let go.
 */
export function OutlineWidthSlider(props: { label: string; value: number; onInput: (width: number) => void; onChange?: () => void }) {
  return (
    <>
      <input
        class="grow"
        type="range"
        aria-label={props.label}
        min="0"
        max={MAX_OUTLINE_WIDTH}
        step="0.5"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
        onChange={() => props.onChange?.()}
      />
      <span class="value">{props.value} px</span>
    </>
  );
}
