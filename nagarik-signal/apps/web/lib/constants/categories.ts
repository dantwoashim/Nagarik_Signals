import type { IssueCategory } from '../types';

export const categories: Array<{ id: IssueCategory; label: string; description: string }> = [
  { id: 'road', label: 'Road', description: 'Potholes, damaged roads, blocked paths.' },
  { id: 'waste', label: 'Waste', description: 'Uncollected public waste or dumping.' },
  { id: 'water', label: 'Water / drainage', description: 'Broken drains, water leaks, overflow.' },
  { id: 'electricity_lighting', label: 'Electricity / lighting', description: 'Streetlight or public electrical issues.' },
  { id: 'public_facility', label: 'Public facility', description: 'Parks, taps, bus stops, public buildings.' },
  { id: 'public_safety_hazard', label: 'Public safety hazard', description: 'Public infrastructure hazards.' },
  { id: 'other_public_infrastructure', label: 'Other public infrastructure', description: 'Other safe public issue.' },
];

export function categoryLabel(category: IssueCategory) {
  return categories.find((item) => item.id === category)?.label ?? category;
}
