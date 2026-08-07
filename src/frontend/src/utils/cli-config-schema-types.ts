export interface SchemaIndex {
  /** The latest stable CLI schema version (e.g. `"13.2.3"`). */
  latest: string;
  /** All available schema versions, oldest first. */
  versions: string[];
}
