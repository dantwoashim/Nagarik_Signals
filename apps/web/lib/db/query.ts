export interface QueryExecutor {
  query(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<Array<Record<string, unknown>>>;
}
