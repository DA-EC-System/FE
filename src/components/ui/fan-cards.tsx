// Spider UI Fan Cards: cài bằng `pnpm dlx shadcn@latest add @spiderui/fan-cards` (20/11/2026).
// Sửa so với bản gốc: tiêu đề dùng chữ không chân (bỏ font-serif), format theo prettier của repo.
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type FanCardItem = {
  id: string;
  title: string;
  subtitle: string;
  bg: string;
  textColor: string;
  subtitleColor: string;
  defaultRotation: number;
  stackIndex: number;
  content?: ReactNode;
};

export const DEFAULT_FAN_CARDS: FanCardItem[] = [
  {
    id: 'working',
    title: 'Working Knowledge',
    subtitle: 'Foundational concepts and practical frameworks for understanding complex systems and workflows.',
    bg: '#F26419',
    textColor: '#fff',
    subtitleColor: 'rgba(255,255,255,0.78)',
    defaultRotation: -14, // Enhanced variance
    stackIndex: 0,
  },
  {
    id: 'practical',
    title: 'Practical Demonstration',
    subtitle: 'Step-by-step walkthroughs that bridge theory and real-world application seamlessly.',
    bg: '#ECEAE3',
    textColor: '#1a1a1a',
    subtitleColor: 'rgba(0,0,0,0.58)',
    defaultRotation: 8,
    stackIndex: 1,
  },
  {
    id: 'collaborate',
    title: 'Collaborate with AI',
    subtitle: 'Leverage artificial intelligence as a creative partner to enhance productivity and innovation.',
    bg: '#3B82F6',
    textColor: '#fff',
    subtitleColor: 'rgba(255,255,255,0.78)',
    defaultRotation: 5,
    stackIndex: 2,
  },
  {
    id: 'means',
    title: 'Means & Methods',
    subtitle: 'Proven strategies and methodologies that streamline workflows and optimize outcomes.',
    bg: '#22C55E',
    textColor: '#0f3a1a',
    subtitleColor: 'rgba(0,0,0,0.58)',
    defaultRotation: -8,
    stackIndex: 3,
  },
  {
    id: 'interface',
    title: 'Interface Kit',
    subtitle: 'A comprehensive collection of UI components and patterns for building beautiful interfaces.',
    bg: '#1C1C1E',
    textColor: '#fff',
    subtitleColor: 'rgba(255,255,255,0.65)',
    defaultRotation: 15,
    stackIndex: 4,
  },
];

export type FanCardsProps = {
  cards?: FanCardItem[];
  spread?: number;
  rotateStep?: number;
  springStiffness?: number;
  springDamping?: number;
  className?: string;
};

const BASE_CARD_W = 320;
const BASE_CARD_H = 400;
const ACTIVE_CARD_W = 400;
const ACTIVE_CARD_H = 500;

const BASE_SPREAD = 100;
const BASE_ROTATION_STEP = 10;

// Layout positions
const DOCK_Y = 200; // Lowers the deck dock when active
const ACTIVE_CARD_Y = -130; // Pushes active card almost completely above the rest of the deck

const FAN_X = [-300, -150, 0, 150, 300]; // More horizontal separation space
const FAN_Y = [15, 50, 10, 45, 15]; // Alternating line margins

const DEFAULT_SPRING = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 26,
  mass: 1,
};

type FanCardProps = {
  card: FanCardItem;
  isSelected: boolean;
  isAnyActive: boolean;
  fanX: number;
  fanY: number;
  rotation: number;
  zIndex: number;
  spring: typeof DEFAULT_SPRING;
  onClick: () => void;
};

const FanCard = ({ card, isSelected, isAnyActive, fanX, fanY, rotation, zIndex, spring, onClick }: FanCardProps) => {
  const [hovered, setHovered] = useState(false);

  const targetX = isSelected ? -40 : isAnyActive ? fanX * 0.45 : fanX;
  const targetY = isSelected ? ACTIVE_CARD_Y : isAnyActive ? DOCK_Y : fanY;
  const targetRotate = isSelected ? 0 : isAnyActive ? rotation * 0.15 : rotation;
  const targetScale = isSelected ? 1 : isAnyActive ? 0.7 : hovered ? 1.04 : 1;

  const currentWidth = isSelected ? ACTIVE_CARD_W : BASE_CARD_W;
  const currentHeight = isSelected ? ACTIVE_CARD_H : BASE_CARD_H;

  return (
    <motion.div
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        marginLeft: -BASE_CARD_W / 2,
        zIndex,
        cursor: isSelected ? 'zoom-out' : 'pointer',
        transformOrigin: 'bottom center',
      }}
      className="will-change-transform transform-gpu select-none overflow-hidden rounded-[24px]"
      initial={{ y: 400, x: 0, scale: 0, filter: 'blur(10px)' }}
      animate={{
        x: targetX,
        y: targetY,
        rotate: targetRotate,
        scale: targetScale,
        width: currentWidth,
        height: currentHeight,
        filter: 'blur(0px)',
      }}
      transition={spring}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onHoverStart={() => !isAnyActive && setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={card.title}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <motion.div
        style={{ background: card.bg }}
        className={cn(
          'absolute inset-0 rounded-[24px] transition-shadow duration-300',
          isSelected
            ? 'shadow-[0_40px_100px_rgba(0,0,0,0.3),0_12px_36px_rgba(0,0,0,0.18)]'
            : 'shadow-[0_8px_32px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.08)]',
        )}
      />

      <div className="pointer-events-none relative flex h-full flex-col justify-between p-8">
        <div className="min-h-0 w-full flex-1 overflow-hidden">
          {card.content ?? (
            <div
              style={{
                background: `linear-gradient(135deg, ${card.bg} 0%, rgba(255,255,255,0.15) 100%)`,
              }}
              className="h-48 w-full rounded-xl opacity-40"
            />
          )}
        </div>

        <div className="shrink-0 pt-4">
          <motion.h2
            layoutId={`title-${card.id}`}
            style={{ color: card.textColor }}
            className={cn('font-bold leading-[1.02] tracking-tight', isSelected ? 'text-5xl' : 'text-4xl')}
          >
            {card.title.includes(' ') ? (
              <>
                <span className="block">{card.title.slice(0, card.title.indexOf(' '))}</span>
                <span className="block">{card.title.slice(card.title.indexOf(' ') + 1)}</span>
              </>
            ) : (
              card.title
            )}
          </motion.h2>

          <AnimatePresence mode="popLayout">
            {isSelected ? (
              <motion.p
                layoutId={`desc-${card.id}`}
                initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
                transition={{ duration: 0.25, delay: 0.08 }}
                style={{ color: card.subtitleColor }}
                className="mt-3 max-w-[340px] text-sm leading-relaxed"
              >
                {card.subtitle}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export function FanCards({
  cards = DEFAULT_FAN_CARDS,
  spread = BASE_SPREAD,
  rotateStep = BASE_ROTATION_STEP,
  springStiffness = DEFAULT_SPRING.stiffness,
  springDamping = DEFAULT_SPRING.damping,
  className,
}: FanCardsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const spreadScale = spread / BASE_SPREAD;
  const rotationScale = rotateStep / BASE_ROTATION_STEP;
  const isAnyActive = selectedId !== null;

  const spring = {
    type: 'spring' as const,
    stiffness: springStiffness,
    damping: springDamping,
    mass: 1,
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setSelectedId(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleCardClick = (id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex min-h-[800px] w-full items-center justify-center overflow-visible pt-40 pb-16',
        className,
      )}
    >
      <div
        className="relative"
        style={{
          width: BASE_CARD_W + 500,
          height: BASE_CARD_H + 180,
        }}
      >
        {cards.map((card) => {
          const isSelected = card.id === selectedId;
          const zIndex = card.stackIndex;

          return (
            <FanCard
              key={card.id}
              card={card}
              isSelected={isSelected}
              isAnyActive={isAnyActive}
              fanX={(FAN_X[card.stackIndex] ?? 0) * spreadScale}
              fanY={FAN_Y[card.stackIndex] ?? 0}
              rotation={card.defaultRotation * rotationScale}
              zIndex={zIndex}
              spring={spring}
              onClick={() => handleCardClick(card.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
