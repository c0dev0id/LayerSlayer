import { MAX_LINE_WIDTH, MIN_LINE_WIDTH } from '../model/layer';

/**
 * The width of a line in pixels, MIN_LINE_WIDTH to MAX_LINE_WIDTH in half pixels: a vector
 * layer's lines, a route's line. `onChange` comes when the slider is let go.
 */
export function LineWidthSlider(props: { label: string; value: number; onInput: (width: number) => void; onChange?: () => void }) {
  return (
    <>
      <input
        class="grow"
        type="range"
        aria-label={props.label}
        min={MIN_LINE_WIDTH}
        max={MAX_LINE_WIDTH}
        step="0.5"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
        onChange={() => props.onChange?.()}
      />
      <span class="value">{props.value} px</span>
    </>
  );
}
