import { isHexColor, within } from './stored';

/** How a vector layer's labels look: the text's colour and size, and the colour and width of the outline that keeps them readable on any map. */
export interface LabelStyle {
  color?: string;
  size?: number;
  outlineColor?: string;
  outlineWidth?: number;
}

/** Dark text in a white outline, which reads on any base map. */
export const LABEL_STYLE: Required<LabelStyle> = { color: '#212529', size: 12, outlineColor: '#ffffff', outlineWidth: 1.5 };

/** Text sizes and outline widths in pixels. */
export const MIN_LABEL_SIZE = 8;
export const MAX_LABEL_SIZE = 24;
export const MAX_OUTLINE_WIDTH = 4;

/** A label style with every value, within bounds whatever a project file says, and the defaults where it sets none. */
export function labelStyle(s: LabelStyle = {}): Required<LabelStyle> {
  return {
    color: isHexColor(s.color) ? s.color : LABEL_STYLE.color,
    size: within(s.size, MIN_LABEL_SIZE, MAX_LABEL_SIZE, LABEL_STYLE.size),
    outlineColor: isHexColor(s.outlineColor) ? s.outlineColor : LABEL_STYLE.outlineColor,
    outlineWidth: within(s.outlineWidth, 0, MAX_OUTLINE_WIDTH, LABEL_STYLE.outlineWidth),
  };
}
