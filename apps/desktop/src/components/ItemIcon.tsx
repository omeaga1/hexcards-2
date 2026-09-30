import { HoverCard } from '@/registry/components/hover-card/hover-card';
import { itemIconUrl, type ItemInfo } from '@hexcards/data';
import styles from './ItemIcon.module.css';

interface ItemIconProps {
  version: string;
  itemId: number;
  item?: ItemInfo;
  size: 'lg' | 'md' | 'sm';
  /** Extra lines under the item's name in the hover card, e.g. "41% of games". */
  details?: string[];
  dimmed?: boolean;
}

export function ItemIcon({ version, itemId, item, size, details = [], dimmed }: ItemIconProps) {
  const name = item?.name ?? `Item ${itemId}`;
  return (
    <HoverCard
      side="bottom"
      content={
        <div className={styles.card}>
          <div className={styles.cardTitle}>{name}</div>
          {item && <div className={styles.cardMeta}>{item.cost.toLocaleString()} gold</div>}
          {item?.plaintext && <p className={styles.cardText}>{item.plaintext}</p>}
          {details.map((line) => (
            <div key={line} className={styles.cardMeta}>{line}</div>
          ))}
        </div>
      }
    >
      <img
        className={styles.icon}
        data-size={size}
        data-dimmed={dimmed || undefined}
        src={itemIconUrl(version, itemId)}
        alt={name}
        tabIndex={0}
        draggable={false}
      />
    </HoverCard>
  );
}
