export function roundedLocation(lat: number, lng: number) {
  return {
    latRounded: Number(lat.toFixed(3)),
    lngRounded: Number(lng.toFixed(3)),
  };
}

export function coarseGeohash(lat: number, lng: number) {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}`;
}
