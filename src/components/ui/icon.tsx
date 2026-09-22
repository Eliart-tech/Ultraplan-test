import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Clock,
  FileBarChart,
  GraduationCap,
  Headset,
  Mail,
  MapPin,
  Menu,
  PenLine,
  Phone,
  PhoneCall,
  Puzzle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  Workflow,
  X,
  type LucideProps,
} from "lucide-react";

/**
 * A closed icon registry: content files reference icons by name (they are plain
 * data, not JSX), and only the icons listed here can ever reach the bundle.
 */
const registry = {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Clock,
  FileBarChart,
  GraduationCap,
  Headset,
  Mail,
  MapPin,
  Menu,
  PenLine,
  Phone,
  PhoneCall,
  Puzzle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  Workflow,
  X,
} as const;

export type IconName = keyof typeof registry;

export function Icon({ name, ...props }: { name: IconName } & LucideProps) {
  const Glyph = registry[name];
  return <Glyph aria-hidden strokeWidth={1.6} {...props} />;
}
