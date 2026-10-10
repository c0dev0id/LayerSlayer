import { For } from 'solid-js';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
  disabled?: boolean;
}

/** A row of joined buttons of which one is chosen: radio buttons drawn as one control. */
export function Segmented<T extends string>(props: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Groups the radio buttons; unique on the page. */
  name: string;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <label title={option.title}>
            <input
              type="radio"
              name={props.name}
              disabled={option.disabled}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        )}
      </For>
    </div>
  );
}
