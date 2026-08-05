begin;

insert into nagarik.operator_profiles(auth_subject, display_name)
values ('70000000-0000-4000-8000-000000000002', 'Public intake policy owner')
on conflict (auth_subject) do nothing;

insert into nagarik.organizations(id, slug, name)
values (
  '70000000-0000-4000-8000-000000000001',
  'public-intake',
  'Nagarik Signal Public Intake'
)
on conflict (id) do nothing;

insert into nagarik.pilot_policies(
  id,
  organization_id,
  version,
  state,
  boundary_version,
  ward_geometry_version,
  boundary_geojson,
  invitation_scope,
  created_by,
  activated_at
)
values (
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000001',
  1,
  'active',
  'public-intake-v1',
  'supported-areas-v1',
  $geojson$
  {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": { "kind": "pilot" },
        "geometry": {
          "type": "MultiPolygon",
          "coordinates": [
            [[[85.306,27.662],[85.366,27.662],[85.366,27.722],[85.306,27.722],[85.306,27.662]]],
            [[[85.275,27.670],[85.335,27.670],[85.335,27.730],[85.275,27.730],[85.275,27.670]]],
            [[[85.287,27.648],[85.347,27.648],[85.347,27.708],[85.287,27.708],[85.287,27.648]]],
            [[[85.399,27.642],[85.459,27.642],[85.459,27.702],[85.399,27.702],[85.399,27.642]]],
            [[[83.955,28.179],[84.015,28.179],[84.015,28.239],[83.955,28.239],[83.955,28.179]]]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": { "kind": "ward", "wardId": "kathmandu-10" },
        "geometry": { "type": "Polygon", "coordinates": [[[85.306,27.662],[85.366,27.662],[85.366,27.722],[85.306,27.722],[85.306,27.662]]] }
      },
      {
        "type": "Feature",
        "properties": { "kind": "ward", "wardId": "kathmandu-12" },
        "geometry": { "type": "Polygon", "coordinates": [[[85.275,27.670],[85.335,27.670],[85.335,27.730],[85.275,27.730],[85.275,27.670]]] }
      },
      {
        "type": "Feature",
        "properties": { "kind": "ward", "wardId": "lalitpur-03" },
        "geometry": { "type": "Polygon", "coordinates": [[[85.287,27.648],[85.347,27.648],[85.347,27.708],[85.287,27.708],[85.287,27.648]]] }
      },
      {
        "type": "Feature",
        "properties": { "kind": "ward", "wardId": "bhaktapur-02" },
        "geometry": { "type": "Polygon", "coordinates": [[[85.399,27.642],[85.459,27.642],[85.459,27.702],[85.399,27.702],[85.399,27.642]]] }
      },
      {
        "type": "Feature",
        "properties": { "kind": "ward", "wardId": "pokhara-08" },
        "geometry": { "type": "Polygon", "coordinates": [[[83.955,28.179],[84.015,28.179],[84.015,28.239],[83.955,28.239],[83.955,28.179]]] }
      }
    ]
  }
  $geojson$::jsonb,
  array['intake'],
  '70000000-0000-4000-8000-000000000002',
  now()
)
on conflict (id) do nothing;

commit;
