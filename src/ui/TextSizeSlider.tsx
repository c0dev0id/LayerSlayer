import { MAX_LABEL_SIZE, MIN_LABEL_SIZE } from '../model/label';

/**
 * The size of text in pixels, MIN_LABEL_SIZE to MAX_LABEL_SIZE: a layer's labels, a route's
 * waypoint names. `onChange` comes when the slider is let go.
 */
export function TextSizeSlider(props: { label: string; value: number; onInput: (size: number) => void; onChange?: () => void }) {
  return (
    <>
      <input
        class="grow"
        type="range"
        aria-label={props.label}
        min={MIN_LABEL_SIZE}
        max={MAX_LABEL_SIZE}
        step="1"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
        onChange={() => props.onChange?.()}
      />
      <span class="value">{props.value} px</span>
    </>
  );
}
