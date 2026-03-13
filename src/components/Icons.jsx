import React from 'react';
import {
  AlertTriangle, Archive, ArrowDownUp, BookOpenText, Check,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Clock, Copy, Database, Download, Eye, EyeOff, Filter,
  FolderPlus, Fullscreen, Grid2x2, HardDrive, Heart, Home,
  Image, Keyboard, Layers, Library, Maximize2, Minus,
  MoonStar, PanelLeftClose, PanelLeftOpen, PencilLine, Pin,
  Play, Plus, RefreshCw, ScrollText, Search, Settings2,
  Sparkles, SunMedium, Tag, Trash2, Upload, X, Zap, ZoomIn, ZoomOut
} from 'lucide-react';

function makeIcon(Component, defaults = {}) {
  return function WrappedIcon({ size = 18, className = '', strokeWidth = 1.9, ...props }) {
    return <Component size={size} className={className} strokeWidth={strokeWidth} {...defaults} {...props} />;
  };
}

export const LibraryIcon = makeIcon(Library);
export const FolderPlusIcon = makeIcon(FolderPlus);
export const SearchIcon = makeIcon(Search);
export function HeartIcon({ filled = false, size = 18, className = '', strokeWidth = 1.9, ...props }) {
  return <Heart size={size} className={className} strokeWidth={strokeWidth} fill={filled ? 'currentColor' : 'none'} {...props} />;
}
export const EyeIcon = makeIcon(Eye);
export const EyeOffIcon = makeIcon(EyeOff);
export const SettingsIcon = makeIcon(Settings2);
export const SunIcon = makeIcon(SunMedium);
export const MoonIcon = makeIcon(MoonStar);
export const MinimizeIcon = makeIcon(Minus);
export const MaximizeIcon = makeIcon(Maximize2);
export const CloseIcon = makeIcon(X);
export const FullscreenIcon = makeIcon(Fullscreen);
export const ChevronLeftIcon = makeIcon(ChevronLeft);
export const ChevronRightIcon = makeIcon(ChevronRight);
export const ChevronDownIcon = makeIcon(ChevronDown);
export const ChevronUpIcon = makeIcon(ChevronUp);
export const LayoutGridIcon = makeIcon(Grid2x2);
export const ScrollIcon = makeIcon(ScrollText);
export const EditIcon = makeIcon(PencilLine);
export const TrashIcon = makeIcon(Trash2);
export const PlusIcon = makeIcon(Plus);
export const SparklesIcon = makeIcon(Sparkles);
export const ZoomInIcon = makeIcon(ZoomIn);
export const ZoomOutIcon = makeIcon(ZoomOut);
export const PanelCollapseIcon = makeIcon(PanelLeftClose);
export const PanelExpandIcon = makeIcon(PanelLeftOpen);
export const BookIcon = makeIcon(BookOpenText);
export const HomeIcon = makeIcon(Home);
export const LayersIcon = makeIcon(Layers);
export const TagIcon = makeIcon(Tag);
export const FilterIcon = makeIcon(Filter);
export const ClockIcon = makeIcon(Clock);
export const PlayIcon = makeIcon(Play);
export const CheckIcon = makeIcon(Check);
export const AlertIcon = makeIcon(AlertTriangle);
export const ImageIcon = makeIcon(Image);
export const RefreshIcon = makeIcon(RefreshCw);
export const PinIcon = makeIcon(Pin);
export const CopyIcon = makeIcon(Copy);
export const DownloadIcon = makeIcon(Download);
export const UploadIcon = makeIcon(Upload);
export const DatabaseIcon = makeIcon(Database);
export const KeyboardIcon = makeIcon(Keyboard);
export const HardDriveIcon = makeIcon(HardDrive);
export const ArchiveIcon = makeIcon(Archive);
export const SortIcon = makeIcon(ArrowDownUp);
export const ZapIcon = makeIcon(Zap);
