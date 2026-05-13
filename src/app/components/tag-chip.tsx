import { tagHue } from '../lib/tag.js';

interface TagChipProps {
  tag: string;
  onClick?: () => void;
  onRemove?: () => void;
  /** Visual emphasis for the active filter chip. */
  active?: boolean;
}

export function TagChip({ tag, onClick, onRemove, active = false }: TagChipProps) {
  const hue = tagHue(tag);
  const style = {
    background: `hsl(${String(hue)} 75% ${active ? '85%' : '92%'})`,
    color: `hsl(${String(hue)} 55% 25%)`,
    borderColor: active ? `hsl(${String(hue)} 60% 60%)` : 'transparent',
  };
  const interactive = onClick !== undefined;
  return (
    <span
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      style={style}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        interactive ? 'cursor-pointer hover:brightness-95' : ''
      }`}
    >
      <span>#{tag}</span>
      {onRemove === undefined ? null : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag}`}
          className="ml-0.5 rounded-full px-1 text-[10px] leading-none hover:bg-black/10"
        >
          ×
        </button>
      )}
    </span>
  );
}
