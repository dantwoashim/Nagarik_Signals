import type { Ward } from '../types';

export const wards: Ward[] = [
  { id: 'kathmandu-10', label: 'Kathmandu Ward 10', locality: 'New Baneshwor', lat: 27.692, lng: 85.336 },
  { id: 'kathmandu-12', label: 'Kathmandu Ward 12', locality: 'Teku', lat: 27.7, lng: 85.305 },
  { id: 'lalitpur-03', label: 'Lalitpur Ward 3', locality: 'Pulchowk', lat: 27.678, lng: 85.317 },
  { id: 'bhaktapur-02', label: 'Bhaktapur Ward 2', locality: 'Dudhpati', lat: 27.672, lng: 85.429 },
  { id: 'pokhara-08', label: 'Pokhara Ward 8', locality: 'New Road', lat: 28.209, lng: 83.985 },
];

export function getWard(id: string) {
  return wards.find((ward) => ward.id === id) ?? wards[0];
}
