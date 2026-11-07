import type { IconName } from '@/ui/Icon';

export interface BlockCategoryMeta {
  id: string;
  label: string;
  icon: IconName;
}

const CATEGORIES: BlockCategoryMeta[] = [
  { id: 'class', label: 'Class', icon: 'class' },
  { id: 'study', label: 'Study', icon: 'study' },
  { id: 'work', label: 'Work', icon: 'work' },
  { id: 'exercise', label: 'Exercise', icon: 'exercise' },
  { id: 'meal', label: 'Meal', icon: 'meal' },
  { id: 'personal', label: 'Personal', icon: 'personal' },
  { id: 'other', label: 'Other', icon: 'other' },
];

export function blockCategoryMeta(id?: string): BlockCategoryMeta {
  const found = CATEGORIES.find((category) => category.id === id);
  if (found) return found;
  const label = id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Other';
  return { id: id || 'other', label, icon: 'other' };
}

export function blockCategories(): BlockCategoryMeta[] {
  return CATEGORIES.slice();
}
