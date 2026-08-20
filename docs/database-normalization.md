# Database design and 3NF audit

MVP schema uses PostgreSQL as the production source of truth. Lucid migrations are the only schema
change mechanism. Each migration has `up` and `down`; deployed migrations are immutable. Production
rollback uses a forward migration, not an ad-hoc rollback.

## Relation boundaries

| Relation | Key dependency | Normalization decision |
| --- | --- | --- |
| `users` | `id -> full_name, email, password, role` | Account attributes live once; role is a constrained domain value. |
| `projects` | `id -> owner_id, title, source_prompt, status` | Project does not repeat user email or video fields. |
| `videos` | `id -> project_id, status, width, height, fps` | Video points to project; it does not repeat `owner_id`. Aspect ratio is derived from dimensions. |
| `scenes` | `(video_id, sequence_no) -> state, spec_version, scene_spec` | Scene order is unique per video. Contract payload is stored as an immutable document snapshot, not duplicated relational columns. |
| `assets` | `id -> storage and provider metadata` | Asset is independent of project/video ownership so the same asset can be reused. |
| `scene_assets` | `(scene_id, asset_id, role) -> sequence_no` | Many-to-many attachment and scene-specific role stay in a junction relation. |
| `generation_jobs` | `(video_id, idempotency_key) -> job state and provider snapshot` | Jobs point to video, never repeat project ownership. Provider snapshot records execution provenance. |
| `render_jobs` | `(video_id, idempotency_key) -> render state and result_asset_id` | Render result references `assets`; binary metadata is not copied into the job row. |

The schema avoids partial dependencies through surrogate primary keys plus explicit composite
uniqueness for scene order and idempotency. It avoids transitive dependencies by not carrying
`owner_id` into video, scene, or job tables, and by keeping scene-asset relationship attributes in
`scene_assets`. `jsonb` fields are bounded snapshots of versioned external contracts; they are not
used as substitutes for queryable relational attributes.

## Migration safety

- New schema and data backfills stay in separate migrations.
- Foreign keys define ownership and deletion behavior explicitly.
- Status and domain values have database `CHECK` constraints as well as application validation.
- Query paths have indexes on ownership, status, provider lookup, checksum, and idempotency.
- `migration:run --force` is the production command; migrations do not run implicitly at server boot.
